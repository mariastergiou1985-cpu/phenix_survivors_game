// ════════════════════════════════════════════════════════════════════════════════
// CHAOS EDEN MEMORY (+3, once, any entry path) and MEGA TITAN RELICS (granted, not gated).
//
// Two defects, both of them the game quietly paying less than it announced:
//
//  1. _chaosEdenAwarded means "the +3 has been PAID". Two escalation paths — the 21:00
//     auto-escalation and the post-arena CHAOS choice — set it to true while only pushing a
//     message, never calling addMem(3). So a run that ESCALATED into Chaos silently lost the +3
//     that a run started from _beginChaosRun kept. The two message-only sites no longer touch
//     the flag; the single paying site in _generateEdenRunMessages still owns it.
//
//  2. A Mega Titan kill called recordBossKill only, which lifts the `req` gate on tryUnlockRelic
//     — the relic then still cost 25 PF + 250 credits. An ACT 1 stage boss calls grantStageRelic
//     and hands its relic over free. The hardest boss in the game paid LESS than a stage boss,
//     under a banner reading "REWARD RELIC UNLOCKED". Now it grants, and says so.
//
// Everything is measured against real MetaProgress state and the real announcement text.
//
// Run: node tools/qa/browser/chaos_eden_titan_relic_proof.mjs [port]
// Writes: /tmp/chaos_eden_relic_proof/  (report.json)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_eden_relic_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8905;
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

// ── Rig ─────────────────────────────────────────────────────────────────────
await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  const src = await fetch('./js/game/Game.js?v=' + window.__BUILD).then(r => r.text()).catch(() => '');
  const ev = (src.match(/Enemy\.js\?v=(\d+)/) || [])[1] || '';
  try { window.__Enemy = (await import(`./js/entities/Enemy.js?v=${ev}`)).Enemy; } catch (_) { window.__Enemy = null; }
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      if (g.player) g.player.hp = g.player.maxHp;
      try { g.update(1 / 60, window.__IN); } catch (_) {}
    }
  };
  // Capture every announcement so the banner text can be asserted, not assumed.
  window.__banners = [];
  const _ta = g.triggerAnnouncement.bind(g);
  g.triggerAnnouncement = (txt, col, opt) => { window.__banners.push(String(txt)); return _ta(txt, col, opt); };

  window.__run = (mode) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    if (mode === 'endless') { try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = 'blood_grid'; try { g._beginChaosRun(); } catch (_) {} }
    window.__step(20);
  };
  // End the run through the game's OWN reward path and report the Eden Memory delta.
  //
  // _generateEdenRunMessages has FOUR Eden sources: survival milestones at 5/10/20 min, a
  // personal-record bonus, the Chaos +3, and (elsewhere) the mega-echo +2. To measure the Chaos
  // component the other three have to be off, or the first run of a session reads +4 because it
  // also set a new record — which is exactly what this rig got wrong on its first pass.
  // `secs` is kept under 5:00 for the milestones; the records are pinned out of reach here.
  window.__endAndMeasure = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    const before = g.meta.getEdenMemory();
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false;
    g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
    return { before, after: g.meta.getEdenMemory(), delta: g.meta.getEdenMemory() - before,
             flag: !!g._chaosEdenAwarded };
  };
  // Kill the currently-armed Mega Titan through the real _updateChaosTitans teardown.
  window.__killTitan = (type) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.enemyType = type; e.isMegaBoss = true; e.maxHp = 100; e.hp = 0; e._killed = true;
    e.pos.x = g.player.pos.x + 100; e.pos.y = g.player.pos.y;
    g._activeTitan = e;
    window.__banners.length = 0;
    try { g._updateChaosTitans(1 / 60); } catch (err) { window.__err = String(err); }
    return { banners: window.__banners.slice() };
  };
});
check('A03 the Enemy class is available to the rig', await page.evaluate(() => !!window.__Enemy));

// ════════════════════════════════════════════════════════════════════════════
// E. EDEN MEMORY — exactly +3, once, whatever the entry path
// ════════════════════════════════════════════════════════════════════════════
// Times chosen to sit UNDER the 5:00 survival milestone so the only Eden source is the Chaos +3.
const direct = await page.evaluate(() => {
  const g = window.__g;
  g.meta.edenMemoryPercent = 0;
  window.__run('chaos');
  return window.__endAndMeasure(120);
});
check('E01 a run STARTED in Chaos pays exactly +3',
  direct.delta === 3 && direct.flag === true, JSON.stringify(direct));

// E02/E03 must drive the REAL escalation code, not a hand-written imitation of it. An earlier
// draft of this file "simulated" them and commented out the very line under test, so both passed
// on the broken build and proved nothing. forceChaos is the shipped escape hatch into the 21:00
// block, and _selectPostArenaChoice(1) is the exact handler the arena screen calls.
const escalated = await page.evaluate(() => {
  const g = window.__g;
  g.meta.edenMemoryPercent = 0;
  window.__run('endless');
  g.forceChaos = true;                      // → the 21:00 auto-escalation block, verbatim
  window.__step(3);
  return { engaged: !!g._chaosMode, flagAfterEntry: !!g._chaosEdenAwarded, ...window.__endAndMeasure(120) };
});
check('E02 a run that ESCALATED into Chaos (21:00 path) pays exactly +3 — the entry path no longer matters',
  escalated.engaged === true && escalated.flagAfterEntry === false &&
  escalated.delta === 3 && escalated.flag === true, JSON.stringify(escalated));

const arena = await page.evaluate(() => {
  const g = window.__g;
  g.meta.edenMemoryPercent = 0;
  window.__run('endless');
  g._postArenaChoice = true;
  g._selectPostArenaChoice(1);              // → ENTER CHAOS MODE, the shipped handler
  window.__step(2);
  return { engaged: !!g._chaosMode, flagAfterEntry: !!g._chaosEdenAwarded, ...window.__endAndMeasure(120) };
});
check('E03 the post-arena CHAOS choice pays exactly +3 as well',
  arena.engaged === true && arena.flagAfterEntry === false &&
  arena.delta === 3 && arena.flag === true, JSON.stringify(arena));

const twice = await page.evaluate(() => {
  const g = window.__g;
  g.meta.edenMemoryPercent = 0;
  window.__run('chaos');
  const first = window.__endAndMeasure(120);
  const second = window.__endAndMeasure(120);   // force a second pass over the same run
  return { first, second, total: g.meta.getEdenMemory() };
});
check('E04 it is paid ONCE per run — a second pass over the same run adds nothing',
  twice.first.delta === 3 && twice.second.delta === 0 && twice.total === 3,
  JSON.stringify(twice));

const nonChaos = await page.evaluate(() => {
  const g = window.__g;
  g.meta.edenMemoryPercent = 0;
  window.__run('endless');
  const e = window.__endAndMeasure(120);
  g.meta.edenMemoryPercent = 0;
  window.__run('campaign');
  const c = window.__endAndMeasure(120);
  return { endless: e, campaign: c };
});
check('E05 CONTROL — Endless and Campaign still pay no Chaos bonus',
  nonChaos.endless.delta === 0 && nonChaos.campaign.delta === 0, JSON.stringify(nonChaos));

const fresh = await page.evaluate(() => {
  const g = window.__g;
  g.meta.edenMemoryPercent = 0;
  window.__run('chaos'); const a = window.__endAndMeasure(120);
  window.__run('chaos'); const b = window.__endAndMeasure(120);
  return { a, b, total: g.meta.getEdenMemory() };
});
check('E06 a NEW Chaos run pays its own +3 — reset re-arms the flag',
  fresh.a.delta === 3 && fresh.b.delta === 3 && fresh.total === 6, JSON.stringify(fresh));

// ════════════════════════════════════════════════════════════════════════════
// T. MEGA TITAN RELICS — granted outright, and the banner says so
// ════════════════════════════════════════════════════════════════════════════
const TITANS = [
  ['T01', 'Giga-Core Overlord',     'overlord_prism_array',      "OVERLORD'S PRISM ARRAY"],
  ['T02', 'Malware Leviathan',      'leviathan_nanite_core',     "LEVIATHAN'S NANITE CORE"],
  ['T03', 'Quantum Void Emperor',   'emperor_singularity_edge',  "EMPEROR'S SINGULARITY EDGE"],
  ['T04', 'Apocalypse Mech Tyrant', 'tyrant_antimatter_battery', "TYRANT'S ANTI-MATTER BATTERY"],
];
const titanSeen = [];
for (const [id, type, relic, name] of TITANS) {
  const r = await page.evaluate(([t, rid]) => {
    const g = window.__g;
    g.meta.relics = {}; g.meta.bossKills = {};
    const pfBefore = g.meta.protocolFragments, crBefore = g.meta.credits;
    window.__run('chaos');
    const out = window.__killTitan(t);
    return { banners: out?.banners ?? [], owned: g.meta.relics[rid] === true,
             pfSpent: pfBefore - g.meta.protocolFragments, crSpent: crBefore - g.meta.credits };
  }, [type, relic]);
  titanSeen.push({ id, type, relic, ...r });
  const banner = r.banners.find(b => b.includes('DESTROYED')) || '';
  check(`${id} killing ${type} GRANTS its relic outright`,
    r.owned === true, `${relic} owned: ${r.owned}`);
  check(`${id}b the banner says it was ACQUIRED and names it`,
    /RELIC ACQUIRED/.test(banner) && banner.includes(name) && !/UNLOCKED/.test(banner),
    banner || 'NO BANNER');
}
check('T05 the grant costs the player nothing — no PF, no credits',
  titanSeen.every(t => t.pfSpent <= 0 && t.crSpent <= 0),
  titanSeen.map(t => `${t.relic} pf${t.pfSpent}/cr${t.crSpent}`).join(', '));

const repeat = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.bossKills = {};
  window.__run('chaos');
  const first = window.__killTitan('Giga-Core Overlord');
  const second = window.__killTitan('Giga-Core Overlord');
  return { first: first.banners.find(b => b.includes('DESTROYED')) || '',
           second: second.banners.find(b => b.includes('DESTROYED')) || '',
           owned: g.meta.relics.overlord_prism_array === true };
});
check('T06 a REPEAT kill is silent about the relic — it only claims the grant that happened',
  /RELIC ACQUIRED/.test(repeat.first) && !/RELIC ACQUIRED/.test(repeat.second) &&
  /DESTROYED/.test(repeat.second) && repeat.owned === true, JSON.stringify(repeat));

const stillGated = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.bossKills = {};
  window.__run('chaos');
  window.__killTitan('Malware Leviathan');
  return { killFlag: g.meta.bossKills.titan_leviathan === true,
           echo: g.meta.bossEchoes?.leviathanMega === true,
           other: Object.keys(g.meta.relics) };
});
check('T07 CONTROL — the kill flag and the echo archive still fire exactly as before',
  stillGated.killFlag === true && stillGated.echo === true, JSON.stringify(stillGated));
check('T07b and ONLY that titan\'s relic is granted — no collateral unlock',
  JSON.stringify(stillGated.other) === JSON.stringify(['leviathan_nanite_core']),
  JSON.stringify(stillGated.other));

const act1 = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {};
  const ok = g.meta.grantStageRelic('neon_defector_core');
  const again = g.meta.grantStageRelic('neon_defector_core');
  return { ok, again, owned: g.meta.relics.neon_defector_core === true };
});
check('T08 CONTROL — the shared grantStageRelic path is unchanged (Act 1 relics still behave)',
  act1.ok === true && act1.again === false && act1.owned === true, JSON.stringify(act1));

// ════════════════════════════════════════════════════════════════════════════
// D. NOTHING ELSE MOVED
// ════════════════════════════════════════════════════════════════════════════
const econ = await page.evaluate(() => {
  const g = window.__g;
  // bossEchoes must be cleared too: the mega +2 fires only on the FIRST archive, and the T-block
  // above already archived every one of them. Without this the control measured 0 and looked
  // like a regression it was not.
  g.meta.relics = {}; g.meta.bossKills = {}; g.meta.bossEchoes = {}; g.meta.edenMemoryPercent = 0;
  window.__run('chaos');
  const em0 = g.meta.getEdenMemory(), pf0 = g.meta.protocolFragments;
  g._bossRush = null;                                  // no rush → no PF bounty
  window.__killTitan('Quantum Void Emperor');
  const emAfterKill = g.meta.getEdenMemory(), pfAfterKill = g.meta.protocolFragments;
  return { echoBonus: emAfterKill - em0, pfDelta: pfAfterKill - pf0 };
});
check('D01 CONTROL — the mega ECHO still pays its +2 Eden Memory, and no PF outside a Boss Rush',
  econ.echoBonus === 2 && econ.pfDelta === 0, JSON.stringify(econ));

await page.evaluate(() => { const g = window.__g; g.gameOver = false; g.victory = false; window.__step(60); });
await page.waitForTimeout(300);
const lum = await page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  if (!c) return { ok: false };
  const o = document.createElement('canvas'); o.width = 160; o.height = 90;
  const cx = o.getContext('2d', { willReadFrequently: true });
  cx.drawImage(c, 0, 0, 160, 90);
  const d = cx.getImageData(0, 0, 160, 90).data;
  let sum = 0, mx = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > mx) mx = l;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  return { ok: true, mean: +(sum / (d.length / 4)).toFixed(2), max: mx, colors: colors.size };
});
check('D02 the game is still rendering — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4, JSON.stringify(lum));
check('D03 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D04 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, direct, escalated, arena, twice, nonChaos, fresh, titanSeen, repeat, stillGated, act1, econ, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
