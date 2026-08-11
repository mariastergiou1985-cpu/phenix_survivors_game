// ════════════════════════════════════════════════════════════════════════════════
// ENDLESS SOAK — Chromium runtime acceptance for the enemy layer and the Endless loop.
//
// The deterministic half of this QA lives in tools/qa/enemy_endless_qa.mjs. This is the half that
// only a real browser can answer: does the shipped build FREEZE, go BLACK, or log errors while
// Endless is actually running, and do the enemies keep moving under real pressure.
//
// Per sample (~1/s) it records: console + page errors, canvas luminance and colour count, the
// worst frame time seen on the real rAF loop, how many live enemies moved since the last sample,
// the active major event, the arena flag, and what is lying on the ground.
//
// TWO THINGS THIS DRIVER MUST DO, both learned the hard way:
//   · ANSWER THE CARD SCREENS. A level-up / mutation / post-arena prompt pauses the run by design.
//     A driver that ignores them freezes the game clock at the first level-up (measured: timeAlive
//     stuck at 5 s for a whole 90 s pass) and every reading after that is about the driver.
//   · KEEP THE BOT ALIVE. It always takes card 0 and walks in circles, so it dies around 35 s. A
//     dead run stops the world too. The HP top-up is a QA affordance, not a balance change.
// Paused and game-over samples are therefore excluded from the liveness verdict rather than
// silently counted as "enemies not moving".
//
// Self-hosting and self-versioning: serves the repo itself and reads BUILD from sw.js, so it never
// drifts from the production cache-bust the way a hard-coded ?v= would.
//
// Navigation goes through the REAL menu the player uses — START GAME → MODE SELECT → ENDLESS →
// MODE BRIEFING (CONTINUE) → character select → START ENDLESS — using the same DOM selectors as
// start_flow_browser_proof.mjs. The briefing screen is the 2026-08-03 START GAME rework; see the
// note at the click itself.
// Driving _enterEndless() directly would skip the entry flow entirely and stop noticing when it
// breaks, which is precisely what happened when the START GAME rework landed.
//
// Run: node tools/qa/browser/endless_soak_proof.mjs [seconds] [port]
// Writes: /tmp/endless_soak/report.json
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = '/tmp/endless_soak';
fs.mkdirSync(OUT, { recursive: true });

const SECS = Number(process.argv[2]) || 120;
const PORT = Number(process.argv[3]) || 8931;
const FREEZE_MS = 2000;          // a frame longer than this is a visible hang, not a hitch

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
const report = { build: BUILD, secs: SECS, frames: [], consoleErrors: [], pageErrors: [], missing: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));

srv.listen(PORT, async () => {
  // Headed when a display exists. Headless software-rasterises and decodes assets differently and
  // produced a ~2.4 s startup stall that a headed run of the same build never showed (234 ms worst
  // over 120 s) — measuring the player's path matters more than convenience here.
  const HEADED = !!process.env.DISPLAY;
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    headless: !HEADED, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  // Endless must be unlocked for the mode card to be selectable — seeded the same way
  // start_flow_browser_proof.mjs does it, so the run starts from a legitimate save state.
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
    try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 })); } catch (_) {}
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => report.pageErrors.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) report.consoleErrors.push(m.text().slice(0, 240)); });
  pg.on('response', r => { if (r.status() === 404) report.missing.push(new URL(r.url()).pathname); });
  await pg.goto(`http://localhost:${PORT}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 30000 });
  await pg.mouse.click(640, 400).catch(() => {});   // gesture for the audio context

  const settle = async () => { await sleep(120); await pg.evaluate(() => { window.__phenixQA?._settleFade?.(); }); await sleep(120); };
  const click = async (sel, opts = {}) => { await pg.click(sel, { timeout: 8000, ...opts }); await settle(); };
  const gameState = () => pg.evaluate(() => window.__phenixQA?.snapshot?.()?.gameState || null);

  // ── the real player path into Endless ──────────────────────────────────────
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  report.nav = { afterStartGame: await gameState() };
  await click('#cgm-modesel .msl-card[data-mode="endless"]', { force: true });
  report.nav.afterModeSelect = await gameState();
  // MODE BRIEFING (2026-08-03 START GAME rework). Choosing ENDLESS or CHAOS in Mode Select no
  // longer lands on Character Select: Game.js _modeSelectChoose() routes both to
  // goToModeIntro(mode), which sets gameState 'mode_intro' and shows the briefing overlay, and
  // only #mi-continue → _modeIntroContinue() → goToCharacterSelect({mode:'endless',
  // from:'mode_select'}) carries on. This driver deliberately walks the REAL menu instead of
  // calling _enterEndless(), so it has to walk the real extra screen too. BOTH hops keep a hard
  // guard, so an entry flow that breaks at either one still stops the soak.
  if (report.nav.afterModeSelect !== 'mode_intro')
    throw new Error(`ENDLESS did not reach the mode briefing (got ${report.nav.afterModeSelect}) — the entry flow changed`);
  await click('#mi-continue');
  report.nav.afterModeIntro = await gameState();
  if (report.nav.afterModeIntro !== 'character_select')
    throw new Error(`mode briefing CONTINUE did not reach character_select (got ${report.nav.afterModeIntro}) — the entry flow changed`);
  await click('#csc-endless-btn');
  report.nav.afterStartEndless = await gameState();
  console.log(`  entry flow: START GAME → ${report.nav.afterStartGame} → mode ENDLESS → ${report.nav.afterModeSelect} → CONTINUE → ${report.nav.afterModeIntro} → START ENDLESS → ${report.nav.afterStartEndless}`);

  // Live instance via the SAME module specifier production uses — a different ?v= would hand us a
  // second Game class and we would be driving something the player never runs.
  await pg.evaluate(async (build) => {
    const { Game } = await import('./js/game/Game.js?v=' + build);
    if (!window.__soakHooked) {
      const orig = Game.prototype.update;
      Game.prototype.update = function (...a) { window.__soakG = this; return orig.apply(this, a); };
      window.__soakHooked = true;
    }
  }, BUILD);
  await pg.waitForFunction(() => !!window.__soakG, undefined, { timeout: 20000 });

  await pg.evaluate(() => {
    const g = window.__soakG;
    g.meta._save = () => {};
    // Startup and steady state are measured SEPARATELY. One cumulative maximum lets a first-load
    // asset hitch masquerade as a mid-game freeze, which is exactly what it did on the first run.
    window.__ft = { last: performance.now(), worst: 0, startupWorst: 0, n: 0, t0: performance.now() };
    const tick = () => {
      const now = performance.now(), dt = now - window.__ft.last;
      window.__ft.last = now; window.__ft.n++;
      if (now - window.__ft.t0 < 15000) { if (dt > window.__ft.startupWorst) window.__ft.startupWorst = dt; }
      else if (dt > window.__ft.worst) window.__ft.worst = dt;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await pg.waitForTimeout(1500);
  const inRun = await pg.evaluate(() => { const g = window.__soakG; return { state: g.gameState, endless: !!g.endless, char: g.selectedCharacter }; });
  report.inRun = inRun;
  console.log(`  soak: build ${BUILD}, ${inRun.char}, endless=${inRun.endless}, ${SECS}s`);
  if (inRun.state !== 'playing' || !inRun.endless)
    throw new Error(`did not land in a live Endless run: ${JSON.stringify(inRun)}`);

  const t0 = Date.now();
  let i = 0;
  while ((Date.now() - t0) / 1000 < SECS) {
    const k = ['KeyW', 'KeyD', 'KeyS', 'KeyA'][i++ % 4];
    await pg.keyboard.down(k); await sleep(800); await pg.keyboard.up(k); await sleep(50);
    await pg.evaluate(() => {
      const g = window.__soakG;
      for (let n = 0; n < 4; n++) {
        if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } continue; }
        if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } continue; }
        if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } continue; }
        break;
      }
      if (g.player && g.player.hp < g.player.maxHp) g.player.hp = g.player.maxHp;
    });
    report.frames.push(await pg.evaluate(() => {
      const g = window.__soakG;
      const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
      const o = document.createElement('canvas'); o.width = 120; o.height = 68;
      const cx = o.getContext('2d', { willReadFrequently: true });
      cx.drawImage(c, 0, 0, 120, 68);
      const d = cx.getImageData(0, 0, 120, 68).data;
      let sum = 0, mx = 0; const u = new Set();
      for (let j = 0; j < d.length; j += 4) {
        const l = (d[j] + d[j + 1] + d[j + 2]) / 3; sum += l; if (l > mx) mx = l;
        u.add((d[j] >> 4) + ',' + (d[j + 1] >> 4) + ',' + (d[j + 2] >> 4));
      }
      const mean = sum / (d.length / 4);
      const paused = !!(g.upgradeUI || g.mutationUI || g._postArenaChoice);
      const alive = (g.enemies || []).filter(e => e && e.hp > 0);
      const moved = alive.filter(e => {
        const dd = e.__soakX === undefined ? null : Math.hypot(e.pos.x - e.__soakX, e.pos.y - e.__soakY);
        e.__soakX = e.pos.x; e.__soakY = e.pos.y;
        return dd === null || dd > 0.5;
      }).length;
      return {
        t: Math.round(g.timeAlive || 0), state: g.gameState, over: !!g.gameOver, paused,
        enemies: alive.length, movedFrac: alive.length ? +(moved / alive.length).toFixed(3) : 1,
        arena: !!g._nullBreachActive, event: g._activeMajorEvent ?? null,
        hpPk: (g.healthPickups || []).length, manaPk: (g.manaPickups || []).length,
        armorPk: (g.armorPickups || []).length,
        meanLum: +mean.toFixed(2), colors: u.size, black: mean < 6 && mx < 24,
        worstFrameMs: +window.__ft.worst.toFixed(1), startupWorstMs: +window.__ft.startupWorst.toFixed(1), rafFrames: window.__ft.n,
      };
    }));
  }

  const F = report.frames;
  // the first 15 s are warm-up: asset decode and shader/atlas upload legitimately stall frames,
  // and an enemy that did not move across a stalled frame is the stall, not a passive enemy.
  const live = F.filter(f => f.enemies > 3 && !f.paused && !f.over && f.t >= 15);
  const s = report.summary = {
    samples: F.length,
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
    blackFrames: F.filter(f => f.black).length,
    meanLumMin: Math.min(...F.map(f => f.meanLum)), meanLumMax: Math.max(...F.map(f => f.meanLum)),
    worstFrameMs: Math.max(...F.map(f => f.worstFrameMs)),
    startupWorstMs: Math.max(...F.map(f => f.startupWorstMs)),
    minMovedFrac: live.length ? Math.min(...live.map(f => f.movedFrac)) : 1,
    liveSamples: live.length,
    eventsSeen: [...new Set(F.map(f => f.event).filter(Boolean))],
    arenaEngaged: F.some(f => f.arena),
    pickupsSeen: { hp: F.some(f => f.hpPk > 0), mana: F.some(f => f.manaPk > 0), armor: F.some(f => f.armorPk > 0) },
    endedAt: F[F.length - 1],
  };

  console.log('\n=== ENDLESS SOAK ===');
  console.log(`  samples            ${s.samples} over ${SECS}s   (build ${BUILD}, ${report.inRun.char})`);
  console.log(`  console errors     ${s.consoleErrors}`);
  console.log(`  page errors        ${s.pageErrors}`);
  console.log(`  black frames       ${s.blackFrames}/${s.samples}   meanLum ${s.meanLumMin}..${s.meanLumMax}`);
  console.log(`  worst frame        ${s.worstFrameMs} ms steady-state  ·  ${s.startupWorstMs} ms during the first 15 s warm-up  (freeze threshold ${FREEZE_MS} ms, steady-state only)`);
  console.log(`  enemy liveness     min moving fraction ${s.minMovedFrac} over ${s.liveSamples} unpaused post-warm-up samples`);
  console.log(`  major events seen  ${s.eventsSeen.length ? s.eventsSeen.join(', ') : 'none in window'}`);
  console.log(`  arena engaged      ${s.arenaEngaged}`);
  console.log(`  pickups on ground  hp=${s.pickupsSeen.hp} mana=${s.pickupsSeen.mana} armor=${s.pickupsSeen.armor}`);
  console.log(`  final state        ${s.endedAt.state} over=${s.endedAt.over} t=${s.endedAt.t}s`);
  if (report.consoleErrors.length) console.log('  consoleError[0]: ' + report.consoleErrors[0]);
  if (report.pageErrors.length) console.log('  pageError[0]: ' + report.pageErrors[0]);

  const bad = [];
  if (s.consoleErrors) bad.push('console errors');
  if (s.pageErrors) bad.push('page errors');
  if (s.blackFrames) bad.push('black frames');
  if (s.worstFrameMs > FREEZE_MS) bad.push(`freeze ${s.worstFrameMs}ms`);
  if (s.minMovedFrac < 0.5) bad.push(`only ${s.minMovedFrac} of enemies moving`);
  if (s.endedAt.state !== 'playing') bad.push('run ended early: ' + s.endedAt.state);
  if (s.endedAt.over) bad.push('player died despite the top-up');
  // NOT a failure: events and the arena run on long timers and may simply not fire inside a short
  // window. Their start/end contract is proven deterministically in tools/qa/enemy_endless_qa.mjs.
  if (!s.eventsSeen.length) console.log('  note: no major event fired inside this window (long timers) — contract covered by enemy_endless_qa.mjs');
  if (!s.arenaEngaged) console.log('  note: the arena did not engage inside this window — contract covered by enemy_endless_qa.mjs');

  console.log(bad.length ? `\n  FAIL: ${bad.join(', ')}\n` : '\n  PASS: no freeze, no black screen, no console errors\n');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`  report: ${path.join(OUT, 'report.json')}`);
  await ctx.close();
  await br.close();
  srv.close();
  process.exit(bad.length ? 1 : 0);
});
