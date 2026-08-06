// ════════════════════════════════════════════════════════════════════════════════
// CHAOS CONTRACTS — three of them, one rolled per run, shown on the HUD, Results and Ledger.
//
//   tc_two_titans   destroy 2 Mega Titans before 15:00
//   tc_boss_rush    clear a Chaos Boss Rush
//   tc_no_pylon     survive 10:00 without touching ANY Chaos Pylon — no buff taken, no pulse
//
// Every one pays +2 PF on success and NOTHING on failure. The R-block proves the roll is random,
// exactly one per run, and stable from the pre-run card through to the payout. The X-block proves
// each contract's own condition and that it pays once. The U-block proves the HUD, the Results
// strip and the Ledger row all agree, because all three read one snapshot.
//
// Run: node tools/qa/browser/chaos_contracts_proof.mjs [port]
// Writes: /tmp/chaos_contracts_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_contracts_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8919;
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
               '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}   BUILD=${BUILD}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp  = await page.context().newCDPSession(page);

const pageErrors = [], consoleErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t)) return;
  consoleErrors.push(t);
});
await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
  const u = r.request().url();
  if (/fonts\.googleapis/.test(u)) return r.fulfill({ status: 200, contentType: 'text/css', body: '/* offline proof */' });
  return r.abort();
});
const shot = async (n) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n), Buffer.from(data, 'base64'));
};

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1300);

check('A00 sw.js BUILD equals index.html main.js ?v=', BUILD === IDX_V, `${BUILD} vs ${IDX_V}`);
await page.evaluate(b => { window.__BUILD = b; }, BUILD);
await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  await new Promise((res) => {
    const orig = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) {
      window.__g = this; mod.Game.prototype.update = orig; res(); return orig.apply(this, a);
    };
  });
}, BUILD);
check('A01 live Game instance captured on the shipped ?v=', await page.evaluate(() => !!window.__g));
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const IDS = ['tc_two_titans', 'tc_boss_rush', 'tc_no_pylon'];
await page.evaluate(async ([IDS]) => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__IDS = IDS;
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      if (g.player) g.player.hp = g.player.maxHp;
      try { g.update(1 / 60, window.__IN); } catch (_) {}
    }
  };
  window.__ctx = () => (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');

  // Starts a Chaos run and FORCES which contract it carries, so each condition can be driven
  // deterministically. The roll itself is proved separately in the R block.
  window.__run = (contractId, law) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    g.runChaosLaw = law === undefined ? 'blood_grid' : law;
    g._contractRolled = true;                // stop _beginChaosRun re-rolling over our choice
    g.runChaosContract = contractId;
    try { g._beginChaosRun(); } catch (_) {}
    g.runChaosContract = contractId;         // reset() must not have cleared it; re-assert anyway
    window.__step(20);
  };
  window.__at = (secs) => { g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs; };
  window.__end = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    window.__at(secs);
    g.gameOver = true; g.victory = false; g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };
  // A REAL Titan kill, through the shipped _updateChaosTitans handler.
  window.__killTitan = (type, atSecs) => {
    if (typeof atSecs === 'number') window.__at(atSecs);
    g.enemies = g.enemies.filter(e => !e.isMegaBoss);
    g._activeTitan = { enemyType: type, hp: 0, _killed: true, isMegaBoss: true, pos: { x: 0, y: 0 } };
    try { g._updateChaosTitans(1 / 60); } catch (e) { window.__err = String(e); }
  };
  window.__TITANS = ['Giga-Core Overlord', 'Malware Leviathan',
                     'Quantum Void Emperor', 'Apocalypse Mech Tyrant'];
  // One tick of the contract checker at a given chaos time.
  window.__tick = (secs) => { if (typeof secs === 'number') window.__at(secs); g._updateChaosContract(); };
  window.__wallet = () => ({
    pf: g.meta.protocolFragments || 0, credits: g.meta.credits || 0,
    eden: g.meta.getEdenMemory ? g.meta.getEdenMemory() : 0,
    rewardedPF: g.meta.rewardedPFTotal || 0,
    level: g.meta.getPlayerProgression ? g.meta.getPlayerProgression().level : 0,
    maxHp: g.player?.maxHp || 0, speed: g.player?.speed || 0,
    xpMult: g.player?.xpMult || 0, cdMult: g.player?.abilityCdMult || 0,
    dr: g.player?.contactDamageReduction || 0,
  });
  window.__openLaw = () => {
    try { g._showChaosLawSelectionOverlay(); } catch (e) { window.__err = String(e); }
    const el = document.getElementById('cgm-chaos-law-sel');
    if (!el) return null;
    const con = el.querySelector('.cls-contract');
    const out = { has: !!con, ring: g._clsNodes ? g._clsNodes().length : -1,
      ringHasContract: g._clsNodes ? g._clsNodes().some(n => n.classList?.contains('cls-contract')) : true,
      h: con ? (con.querySelector('.cc-h')?.textContent || '').trim() : '',
      g: con ? (con.querySelector('.cc-g')?.textContent || '').trim() : '',
      r: con ? (con.querySelector('.cc-r')?.textContent || '').trim() : '' };
    try { g._hideChaosLawSelectionOverlay(); } catch (_) {}
    return out;
  };
  // Results strip, read out of the REAL _resultsHTML.
  window.__results = () => {
    let html = '';
    try { html = g._resultsHTML(); } catch (e) { window.__err = String(e); return null; }
    const d = document.createElement('div'); d.innerHTML = html;
    const hit = [...d.querySelectorAll('div')].filter(n =>
      /CONTRACT ·/.test(n.textContent) && n.children.length === 0);
    const block = hit.length ? hit[0].parentElement : null;
    return block ? { text: block.textContent.replace(/\s+/g, ' ').trim() } : null;
  };
  // A single trigger of a real pylon, through the shipped trigger loop.
  window.__pylon = (type) => {
    // Same shape the shipped spawner pushes (life/maxLife/radius) — a stub missing radius made
    // _drawChaosPylons build a non-finite gradient and threw in the game loop. Harness, not game.
    g._chaosPylons = [{ type, pos: g.player.pos.clone(), life: 6.0, maxLife: 6.0, radius: 28, triggered: false }];
    try { g._updateChaosPylons(1 / 60); } catch (e) { window.__err = String(e); }
  };
}, [IDS]);

// ════════════════════════════════════════════════════════════════════════════
// R. THE ROLL — one random contract per run
// ════════════════════════════════════════════════════════════════════════════
const roll = await page.evaluate(() => {
  const g = window.__g;
  const seen = {}, ids = [];
  for (let i = 0; i < 200; i++) {
    g._contractRolled = false;
    g._rollChaosContract();
    seen[g.runChaosContract] = (seen[g.runChaosContract] || 0) + 1;
    ids.push(g.runChaosContract);
  }
  return { seen, distinct: Object.keys(seen).length, first: ids.slice(0, 6) };
});
check('R01 the roll picks from ALL THREE contracts, and only those three',
  roll.distinct === 3 && Object.keys(roll.seen).every(k => ['tc_two_titans', 'tc_boss_rush', 'tc_no_pylon'].includes(k)) &&
  Object.values(roll.seen).every(n => n > 20),
  JSON.stringify(roll.seen));

const oneEach = await page.evaluate(() => {
  const g = window.__g;
  const out = [];
  for (let i = 0; i < 8; i++) {
    g._contractRolled = false;
    g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    try { g._beginChaosRun(); } catch (_) {}
    out.push({ id: g.runChaosContract, done: g._contractDoneAt, paid: g._contractPaid,
               pylons: g._chaosPylonsTaken, active: !!g._activeContract() });
  }
  return out;
});
check('R02 every run carries exactly ONE contract, and starts it fresh',
  oneEach.length === 8 && oneEach.every(r => r.active && ['tc_two_titans', 'tc_boss_rush', 'tc_no_pylon'].includes(r.id) &&
    r.done === -1 && r.paid === false && r.pylons === 0),
  JSON.stringify(oneEach.slice(0, 3)));

const stable = await page.evaluate(() => {
  const g = window.__g;
  // The pre-run path: startChaosRun rolls, the card shows it, _beginChaosRun must KEEP it.
  g.meta.addEdenMemory?.(100);
  const out = [];
  for (let i = 0; i < 6; i++) {
    g._contractRolled = false; g.runChaosContract = null;
    g._pendingChaosStart = false;
    try { g.startChaosRun(); } catch (_) {}
    const shown = g.runChaosContract;                       // what the card would print
    const card  = window.__openLaw();
    g._pendingChaosStart = false;
    try { g._beginChaosRun(); } catch (_) {}
    out.push({ shown, ran: g.runChaosContract, same: shown === g.runChaosContract,
               cardNamesIt: !!card && card.h.length > 0 });
  }
  return out;
});
check('R03 the contract on the pre-run card is the contract the run actually gets',
  stable.length === 6 && stable.every(r => r.same && r.cardNamesIt), JSON.stringify(stable.slice(0, 3)));

const card = await page.evaluate(() => {
  const g = window.__g;
  g._contractRolled = true; g.runChaosContract = 'tc_no_pylon';
  const a = window.__openLaw();
  g.runChaosContract = 'tc_boss_rush';
  const b = window.__openLaw();
  g.runChaosContract = null;                        // Endless / reroll: no contract, no strip
  const none = window.__openLaw();
  return { a, b, none };
});
check('R04 the pre-run card names THIS run\'s contract, with reward and no-penalty',
  /SILENCE CONTRACT/.test(card.a.h) && /without touching a single Chaos Pylon/.test(card.a.g) &&
  /\+2 Protocol Fragments/.test(card.a.r) && /No penalty on failure/.test(card.a.r) &&
  /RUSH CONTRACT/.test(card.b.h) && /Clear a Chaos Boss Rush/.test(card.b.g),
  JSON.stringify({ a: card.a.h, b: card.b.h }));
check('R05 with no contract rolled the strip does not render, and the ring is unchanged either way',
  card.none.has === false && card.a.has === true &&
  card.a.ring === 8 && card.none.ring === 8 &&
  card.a.ringHasContract === false,
  JSON.stringify({ withRing: card.a.ring, withoutRing: card.none.ring, has: card.none.has }));

// ════════════════════════════════════════════════════════════════════════════
// X. EACH CONTRACT'S OWN CONDITION
// ════════════════════════════════════════════════════════════════════════════
const titan = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_two_titans');
  const w0 = window.__wallet();
  window.__killTitan(window.__TITANS[0], 120);
  const one = { pf: window.__wallet().pf, done: g._contractDoneAt };
  window.__killTitan(window.__TITANS[1], 400);
  const two = { pf: window.__wallet().pf, done: g._contractDoneAt };
  return { w0, one, two };
});
check('X01 TITAN — two Mega Titans inside 15:00 pays +2 PF, one does not',
  titan.one.pf === titan.w0.pf && titan.one.done === -1 &&
  titan.two.pf - titan.w0.pf === 2 && titan.two.done === 400,
  JSON.stringify({ one: titan.one, two: titan.two }));

const titanLate = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_two_titans');
  const w0 = window.__wallet();
  window.__killTitan(window.__TITANS[0], 300);
  window.__killTitan(window.__TITANS[1], 901);          // one second past the window
  const after = window.__wallet();
  window.__tick(1200);
  return { w0, after, later: window.__wallet(), done: g._contractDoneAt, lost: g._contractState().lost };
});
check('X02 TITAN — one second past 15:00 never pays, and stays unpayable',
  titanLate.after.pf === titanLate.w0.pf && titanLate.later.pf === titanLate.w0.pf &&
  titanLate.done === -1 && titanLate.lost === true,
  JSON.stringify({ pf: `${titanLate.w0.pf} -> ${titanLate.later.pf}`, lost: titanLate.lost }));

const rush = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_boss_rush');
  const w0 = window.__wallet();
  window.__tick(200);
  const before = { pf: window.__wallet().pf, done: g._contractDoneAt };
  g._chaosRushCleared = 1;                     // the shipped tally, set by a real rush clear
  window.__tick(240);
  return { w0, before, after: { pf: window.__wallet().pf, done: g._contractDoneAt } };
});
check('X03 RUSH — clearing a Chaos Boss Rush pays +2 PF, and nothing pays before it',
  rush.before.pf === rush.w0.pf && rush.before.done === -1 &&
  rush.after.pf - rush.w0.pf === 2 && rush.after.done === 240,
  JSON.stringify({ before: rush.before, after: rush.after }));

const silence = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_no_pylon');
  const w0 = window.__wallet();
  window.__tick(599);
  const early = { pf: window.__wallet().pf, done: g._contractDoneAt };
  window.__tick(600);
  return { w0, early, at600: { pf: window.__wallet().pf, done: g._contractDoneAt } };
});
check('X04 SILENCE — 10:00 untouched pays +2 PF, and 9:59 does not',
  silence.early.pf === silence.w0.pf && silence.early.done === -1 &&
  silence.at600.pf - silence.w0.pf === 2 && silence.at600.done === 600,
  JSON.stringify({ early: silence.early, at600: silence.at600 }));

const pylonBreak = await page.evaluate(() => {
  const g = window.__g;
  const out = {};
  for (const type of ['shield', 'heal', 'danger']) {
    window.__run('tc_no_pylon');
    const w0 = window.__wallet();
    window.__tick(120);
    window.__pylon(type);                      // a REAL pylon trigger through the shipped loop
    const counters = { pulses: g._chaosPulseHits || 0, buffs: g._chaosPylonsTaken || 0 };
    window.__tick(900);                        // well past 10:00
    out[type] = { counters, pf: window.__wallet().pf - w0.pf, done: g._contractDoneAt,
                  lost: g._contractState().lost };
  }
  return out;
});
check('X05 SILENCE — a BUFF pylon breaks it (Maria: both readings count)',
  pylonBreak.shield.counters.buffs === 1 && pylonBreak.shield.counters.pulses === 0 &&
  pylonBreak.shield.pf === 0 && pylonBreak.shield.done === -1 && pylonBreak.shield.lost === true &&
  pylonBreak.heal.counters.buffs === 1 && pylonBreak.heal.pf === 0 && pylonBreak.heal.lost === true,
  JSON.stringify({ shield: pylonBreak.shield, heal: pylonBreak.heal }));
check('X06 SILENCE — a DANGER pylon breaks it too, and is not double-counted as a buff',
  pylonBreak.danger.counters.pulses === 1 && pylonBreak.danger.counters.buffs === 0 &&
  pylonBreak.danger.pf === 0 && pylonBreak.danger.done === -1 && pylonBreak.danger.lost === true,
  JSON.stringify(pylonBreak.danger));

const once = await page.evaluate(() => {
  const g = window.__g;
  const out = {};
  for (const id of window.__IDS) {
    window.__run(id);
    const w0 = window.__wallet();
    // Drive the condition, then keep driving it well past completion.
    if (id === 'tc_two_titans') { window.__killTitan(window.__TITANS[0], 60); window.__killTitan(window.__TITANS[1], 120);
                                  window.__killTitan(window.__TITANS[2], 200); window.__killTitan(window.__TITANS[3], 260); }
    if (id === 'tc_boss_rush')  { g._chaosRushCleared = 1; window.__tick(100); g._chaosRushCleared = 4; window.__tick(300); }
    if (id === 'tc_no_pylon')   { window.__tick(600); window.__tick(900); window.__tick(1500); }
    for (let i = 0; i < 120; i++) window.__tick();
    const mid = window.__wallet().pf - w0.pf;
    const st  = { at: g._contractDoneAt, paid: g._contractPaid };
    window.__end(1800);                        // the run-end path must not re-open or re-pay it
    out[id] = { mid, st, after: { at: g._contractDoneAt, paid: g._contractPaid } };
  }
  return out;
});
// Measured on the CONTRACT, not on the wallet total. Comparing PF across __end() would have
// counted the run's own shipped payout — a 30-minute run with four Titans unlocks Endless
// achievements that pay PF of their own, and an earlier draft of this check read "+7" and called
// it a double-pay. The claim here is that the contract fires once and never re-arms.
check('X07 CAP — each contract pays EXACTLY ONCE, however hard the condition is re-met',
  Object.values(once).every(v => v.mid === 2 && v.st.paid === true && v.st.at >= 0 &&
    v.after.paid === true && v.after.at === v.st.at), JSON.stringify(once));

const noPenalty = await page.evaluate(() => {
  const g = window.__g;
  const delta = (a, b) => { const o = {}; for (const k of Object.keys(a)) o[k] = +(b[k] - a[k]).toFixed(4); return o; };
  // Pre-consume every Titan first-kill grant so the two runs start from the same shelf.
  window.__run('tc_two_titans');
  for (let i = 0; i < 4; i++) window.__killTitan(window.__TITANS[i], 60 + i * 30);
  window.__end(1000);

  window.__run('tc_boss_rush');                 // WIN
  const w0 = window.__wallet();
  g._chaosRushCleared = 1; window.__tick(300);
  window.__end(1000);
  const win = delta(w0, window.__wallet());

  window.__run('tc_boss_rush');                 // LOSE — never cleared one
  const l0 = window.__wallet();
  window.__tick(300);
  window.__end(1000);
  const lose = delta(l0, window.__wallet());
  return { win, lose, diff: delta(lose, win) };
});
check('X08 NO PENALTY — vs a matched winning run the ONLY difference is the +2 PF',
  noPenalty.diff.pf === 2 && noPenalty.diff.rewardedPF === 2 &&
  Object.entries(noPenalty.diff).every(([k, v]) => (k === 'pf' || k === 'rewardedPF') ? v === 2 : v === 0) &&
  noPenalty.lose.pf === 0,
  JSON.stringify({ win: noPenalty.win, lose: noPenalty.lose, diff: noPenalty.diff }));

const levelNeutral = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_boss_rush');
  const before = window.__wallet();
  g._chaosRushCleared = 1; window.__tick(200);
  return { before, after: window.__wallet() };
});
check('X09 the +2 PF stays LEVEL-NEUTRAL — spendable, but it cannot inflate the pilot level',
  levelNeutral.after.pf - levelNeutral.before.pf === 2 &&
  levelNeutral.after.rewardedPF - levelNeutral.before.rewardedPF === 2 &&
  levelNeutral.after.level === levelNeutral.before.level,
  JSON.stringify({ pf: `${levelNeutral.before.pf}->${levelNeutral.after.pf}`,
                   level: `${levelNeutral.before.level}->${levelNeutral.after.level}` }));

const notChaos = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_boss_rush');
  g._chaosMode = false;                         // outside Chaos nothing may pay
  const before = window.__wallet();
  g._chaosRushCleared = 1;
  for (let i = 0; i < 60; i++) window.__tick(300 + i);
  return { before, after: window.__wallet(), done: g._contractDoneAt };
});
check('X10 CONTROL — outside Chaos no contract ever pays',
  notChaos.after.pf === notChaos.before.pf && notChaos.done === -1,
  JSON.stringify({ pf: `${notChaos.before.pf} -> ${notChaos.after.pf}` }));

// ════════════════════════════════════════════════════════════════════════════
// U. THE THREE SURFACES — HUD, Results, Ledger
// ════════════════════════════════════════════════════════════════════════════
const hud = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_two_titans');
  window.__tick(60);
  const cold = g._contractState();
  window.__killTitan(window.__TITANS[0], 120);
  const half = g._contractState();
  window.__killTitan(window.__TITANS[1], 200);
  const done = g._contractState();
  window.__run('tc_no_pylon');
  window.__tick(120); window.__pylon('shield'); window.__tick(130);
  const lost = g._contractState();
  return { cold, half, done, lost };
});
check('U01 the HUD snapshot tracks real PROGRESS — 0 -> 0.5 -> 1',
  hud.cold.prog === 0 && hud.half.prog === 0.5 && hud.done.prog === 1 &&
  /TITANS 0\/2/.test(hud.cold.hud) && /TITANS 1\/2/.test(hud.half.hud),
  JSON.stringify({ cold: hud.cold.hud, half: hud.half.hud, prog: [hud.cold.prog, hud.half.prog, hud.done.prog] }));
check('U02 the snapshot reports done / lost states, and names the contract',
  hud.done.done === true && hud.done.lost === false && hud.done.name === 'TITAN CONTRACT' &&
  hud.lost.done === false && hud.lost.lost === true && hud.lost.name === 'SILENCE CONTRACT',
  JSON.stringify({ done: [hud.done.name, hud.done.done], lost: [hud.lost.name, hud.lost.lost] }));

const hudDrawn = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_two_titans');
  window.__killTitan(window.__TITANS[0], 120);
  window.__step(4);
  try { g.draw(window.__ctx()); } catch (e) { return { err: String(e), lit: 0 }; }
  // Counts AMBER pixels specifically (#ff9f0a: high red, mid green, low blue), not merely "lit"
  // ones. A plain brightness count over this band also catches the arena floor behind the HUD, so
  // it passed on a build with the whole readout disabled — a check that cannot fail. The contract
  // label, its progress line and its bar are the only amber in this corner.
  const ctx = window.__ctx();
  const d = ctx.getImageData(10, 55, 160, 32).data;
  let amber = 0, lit = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r + gg + b > 150) lit++;
    if (r > 170 && gg > 90 && gg < 200 && b < 95 && r - b > 110) amber++;
  }
  return { amber, lit, err: null };
});
check('U03 the readout is actually DRAWN on the canvas HUD, in Chaos',
  hudDrawn.err === null && hudDrawn.amber > 40, JSON.stringify(hudDrawn));

// A/B on the SAME FRAME, which is the only way to isolate the readout. The first version of this
// drew a plain Endless run and counted lit pixels in the same band — but the band sits over the
// LIVING WORLD, so it read 1465 lit pixels of arena, not of HUD, and would have "passed" or
// failed on how bright the floor happened to be. Here the scene, the camera and the entities are
// identical between the two draws; the only difference is whether a contract is active.
const hudOff = await page.evaluate(() => {
  const g = window.__g;
  const band = () => {
    const ctx = window.__ctx();
    const d = ctx.getImageData(10, 55, 160, 32).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++;
    return lit;
  };
  let err = null;
  window.__run('tc_two_titans');
  window.__killTitan(window.__TITANS[0], 120);
  window.__step(4);
  try { g.draw(window.__ctx()); } catch (e) { err = String(e); }
  const withC = band();
  const keep = g.runChaosContract;
  g.runChaosContract = null;                      // same frame, same world, no contract
  try { g.draw(window.__ctx()); } catch (e) { err = err || String(e); }
  const withoutC = band();
  g.runChaosContract = keep;
  g._chaosMode = false;                           // and the Chaos gate alone suppresses it too
  try { g.draw(window.__ctx()); } catch (e) { err = err || String(e); }
  const notChaos = band();
  return { withC, withoutC, notChaos, err };
});
check('U04 CONTROL — the readout is the ONLY difference: no contract, or no Chaos, and it is gone',
  hudOff.err === null && hudOff.withC > hudOff.withoutC + 150 &&
  hudOff.withC > hudOff.notChaos + 150,
  JSON.stringify(hudOff));

const resultsOut = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_boss_rush');
  g._chaosRushCleared = 1; window.__tick(300);
  window.__end(1000);
  const won = window.__results();
  window.__run('tc_no_pylon');
  window.__tick(120); window.__pylon('heal');
  window.__end(1000);
  const missed = window.__results();
  return { won, missed };
});
check('U05 the RESULTS screen names the contract and its verdict — completed',
  resultsOut.won && /CONTRACT · RUSH CONTRACT/.test(resultsOut.won.text) &&
  /Clear a Chaos Boss Rush/.test(resultsOut.won.text) &&
  /COMPLETE/.test(resultsOut.won.text) && /\+2 PF/.test(resultsOut.won.text),
  resultsOut.won?.text?.slice(0, 130));
check('U06 the RESULTS screen says NOT COMPLETED, and says there is no penalty',
  resultsOut.missed && /CONTRACT · SILENCE CONTRACT/.test(resultsOut.missed.text) &&
  /NOT COMPLETED/.test(resultsOut.missed.text) && /No penalty/.test(resultsOut.missed.text) &&
  !/\+2 PF/.test(resultsOut.missed.text),
  resultsOut.missed?.text?.slice(0, 130));

const ledger = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('tc_boss_rush');
  g._chaosRushCleared = 1; window.__tick(300);
  window.__end(1000);
  window.__run('tc_no_pylon');
  window.__tick(120); window.__pylon('heal');
  window.__end(1000);
  const rows = (g.meta.getChaosLedger() || []).map(r => ({ c: r.contract, d: r.contractDone }));
  const esc = (v) => String(v ?? '');
  const html = g._chaosLedgerHTML(esc, (s) => String(s), { BRONZE: '#fff' });
  return { rows, html };
});
check('U07 the LEDGER stores which contract the run had and whether it completed',
  ledger.rows.length === 2 &&
  ledger.rows[0].c === 'tc_no_pylon'  && ledger.rows[0].d === false &&
  ledger.rows[1].c === 'tc_boss_rush' && ledger.rows[1].d === true,
  JSON.stringify(ledger.rows));
check('U08 the LEDGER prints it — a tick for the completed one, a cross for the missed one',
  /&#10003; RUSH/.test(ledger.html) && /&#10007; SILENCE/.test(ledger.html),
  (ledger.html.match(/&#1000[37];\s*[A-Z]+/g) || []).join(' | '));

const legacy = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [{ char: 'skeleton_warrior', law: 'blood_grid', secs: 500, rank: 'SILVER',
                          kills: 10, titans: 0, corrupted: 0, date: '1/1/2026' }];
  const esc = (v) => String(v ?? '');
  const html = g._chaosLedgerHTML(esc, (s) => String(s), { SILVER: '#fff' });
  return { html, hasCross: /&#10007;/.test(html), hasTick: /&#10003;/.test(html) };
});
check('U09 a pre-contract LEDGER entry shows no contract mark at all — not a false "failed"',
  legacy.hasCross === false && legacy.hasTick === false && legacy.html.length > 0,
  JSON.stringify({ cross: legacy.hasCross, tick: legacy.hasTick }));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('chaos_hud.png');
const black = await page.evaluate(() => {
  const g = window.__g;
  window.__run('tc_no_pylon');
  window.__step(45);
  try { g.draw(window.__ctx()); } catch (_) {}
  const ctx = window.__ctx();
  const { width: w, height: h } = ctx.canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, max = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += v; if (v > max) max = v;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  const n = Math.floor(d.length / (4 * 97));
  return { mean: sum / n, max, colors: colors.size };
});
await shot('chaos_run.png');
check('D01 the game is still rendering — no black screen',
  black.mean > 3 && black.max > 40 && black.colors > 30, JSON.stringify(black));
check('D02 zero page errors across the whole session',
  pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D03 zero console errors across the whole session',
  consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
