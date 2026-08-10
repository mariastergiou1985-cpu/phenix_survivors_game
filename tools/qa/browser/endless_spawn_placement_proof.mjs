// ════════════════════════════════════════════════════════════════════════════════
// ENDLESS SPAWN PLACEMENT — RUNTIME verification.
//
// WHY THIS EXISTS
// tools/qa/phase5_spawn_validation_audit.mjs reported 2218 / 3384 Endless spawns as
// "non-walkable or without a route". That number came from a headless node simulation that
// generates its OWN requested positions and applies its OWN post-spawn clamp — neither of which
// is what the shipped game does. This driver answers the same question from the other side:
// a REAL Endless run in Chromium, entered through the real menu, with the real WaveDirector
// choosing the positions, and every measurement taken with the SHIPPED walkability API
// (MapManager.isWalkablePoint / isWalkableFootprint) against the SHIPPED walk mode.
//
// WHAT IS MEASURED, PER SPAWNED ENEMY
//   · where it actually entered the world (recorded at the end of the update tick that created
//     it — i.e. AFTER the production walkable clamp in _updateSpawning, which is the position the
//     player's game really has to deal with)
//   · footprint walkability at that position, with the enemy's own radius
//   · whether a route to the player exists — BFS over the shipped isWalkableFootprint
//   · what it then DID: total displacement, closest approach to the player, the engine's own
//     _stuckT timer. An enemy that is genuinely stranded cannot hide from this.
//   · whether it was offscreen at spawn — Endless spawns offscreen BY DESIGN, so an offscreen
//     spawn is only a defect if it also fails to reach the player.
//
// COVERAGE. Trash and mega bosses appear on their own inside the observation window. Elite waves
// fire at 90 s then every 110 s of GAME time, and the miniboss/boss insertions sit at 10/15/25
// minutes — far outside any practical browser window. Those are therefore ALSO driven through
// their own shipped entry points (_spawnEliteWave() verbatim; spawnEnemy(type, pos) with `pos`
// taken from the real WaveDirector.spawnPlan, which is exactly how _updateSpawning feeds it).
// Forced samples are counted and reported SEPARATELY so nothing is passed off as organic.
//
// NOTHING IS FIXED HERE. This driver is read-only with respect to game logic; the only writes are
// the QA affordances the soak proof already uses (answer card screens, keep the bot alive).
//
// Run: node tools/qa/browser/endless_spawn_placement_proof.mjs [observeSeconds] [port]
// Writes: /tmp/endless_spawn/report.json
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = '/tmp/endless_spawn';
fs.mkdirSync(OUT, { recursive: true });

const OBS = Number(process.argv[2]) || 150;
const PORT = Number(process.argv[3]) || 8947;

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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { build: BUILD, observeSecs: OBS, pageErrors: [], consoleErrors: [] };

srv.listen(PORT, async () => {
  const HEADED = !!process.env.DISPLAY;
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    headless: !HEADED, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
    try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 })); } catch (_) {}
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => report.pageErrors.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) report.consoleErrors.push(m.text().slice(0, 240)); });
  await pg.goto(`http://localhost:${PORT}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 30000 });
  await pg.mouse.click(640, 400).catch(() => {});

  const settle = async () => { await sleep(150); await pg.evaluate(() => { window.__phenixQA?._settleFade?.(); }); await sleep(150); };
  // The tutorial overlay intercepts clicks; dismiss it the way the player does (never disabled).
  const clearTutorial = async (max = 12) => {
    for (let n = 0; n < max; n++) {
      const vis = await pg.evaluate(() => !!document.querySelector('#tut-card, #tut-continue'));
      if (!vis) return;
      try { await pg.click('#tut-continue', { timeout: 1200 }); }
      catch (_) { await pg.keyboard.press('Enter'); }
      await sleep(240);
    }
  };
  const click = async (sel, opts = {}) => { await clearTutorial(); await pg.click(sel, { timeout: 10000, ...opts }); await settle(); };
  const waitState = async (want, ms = 8000) => {
    try { await pg.waitForFunction(w => window.__phenixQA?.snapshot?.()?.gameState === w, want, { timeout: ms }); return true; }
    catch (_) { return false; }
  };

  // ── the real player path into Endless: START GAME → MODE SELECT → briefing → CHARACTER
  //    SELECT → START ENDLESS. Same route flow_smoke_proof.mjs drives. ────────────────────────
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await waitState('mode_select');
  await click('#cgm-modesel .msl-card[data-mode="endless"]', { force: true });
  if (await waitState('mode_intro', 3000)) { await click('#mi-continue'); }
  await waitState('character_select');
  await click('#csc-endless-btn').catch(async () => { await click('#csc-start-btn'); });
  await waitState('playing', 12000);
  await clearTutorial();

  await pg.evaluate(async (build) => {
    const { Game } = await import('./js/game/Game.js?v=' + build);
    if (!window.__spHooked) {
      const origUpdate = Game.prototype.update;
      Game.prototype.update = function (...a) { window.__spG = this; return origUpdate.apply(this, a); };
      window.__spHooked = true;
      window.__spGameClass = Game;
    }
  }, BUILD);
  await pg.waitForFunction(() => !!window.__spG, undefined, { timeout: 20000 });
  await pg.waitForTimeout(800);

  const inRun = await pg.evaluate(() => {
    const g = window.__spG;
    return { state: g.gameState, endless: !!g.endless, char: g.selectedCharacter, mode: g._walkMode?.() };
  });
  report.inRun = inRun;
  if (inRun.state !== 'playing' || !inRun.endless)
    throw new Error(`did not land in a live Endless run: ${JSON.stringify(inRun)}`);
  console.log(`  build ${BUILD} · ${inRun.char} · endless=${inRun.endless} · walkMode="${inRun.mode}"`);

  // ═══ INSTRUMENTATION ══════════════════════════════════════════════════════════
  report.model = await pg.evaluate(() => {
    const g = window.__spG, mm = g.mapManager, mode = g._walkMode();
    const m = mm._walkModel(mode);
    const b = g.getWalkableBounds?.();
    const G = window.__spGameClass;

    window.__sp = {
      recs: [],            // one per enemy that entered the world
      nextId: 1,
      srcTag: null,        // set by the wrapped spawners while they run
      forced: false,
      frames: 0,
    };
    const S = window.__sp;

    const classify = (e) => {
      if (e.isMegaBoss) return 'mega';
      if (typeof e.isBoss === 'function' && e.isBoss()) return 'boss';
      if (e.isElite) return 'elite';
      return 'trash';
    };

    // ── wrap the two shipped spawners so every enemy carries the path it came from.
    //    The tag is written onto the enemy INSIDE the wrapper, because the recording sweep runs
    //    at the end of the tick, long after the wrapper has returned. ──
    const wrap = (name, tag) => {
      const orig = G.prototype[name];
      if (!orig) return;
      G.prototype[name] = function (...a) {
        const n0 = this.enemies ? this.enemies.length : 0;
        const r = orig.apply(this, a);
        if (this.enemies) {
          for (let j = n0; j < this.enemies.length; j++) {
            const e = this.enemies[j];
            if (e && e.__spsrc === undefined) { e.__spsrc = tag; e.__spforced = !!S.forcedNow; }
          }
        }
        return r;
      };
    };
    wrap('spawnEnemy', 'wave_director');
    wrap('_spawnEliteWave', 'elite_wave');

    // ── record at the END of the update tick, so the production walkable clamp inside
    //    _updateSpawning has already run. This is the position the game really presents. ──
    const origUpdate = G.prototype.update;
    G.prototype.update = function (...a) {
      const r = origUpdate.apply(this, a);
      const g2 = this;
      if (g2.gameState === 'playing' && g2.endless && g2.player) {
        const mode2 = g2._walkMode();
        const px = g2.player.pos.x, py = g2.player.pos.y;
        const camX = g2.camera?.x ?? 0, camY = g2.camera?.y ?? 0;
        const vw = g2._viewW || 1280, vh = g2._viewH || 720;
        for (const e of g2.enemies) {
          if (!e || !e.pos) continue;
          if (e.__spid === undefined) {
            e.__spid = S.nextId++;
            const rr = e.radius || 14;
            const d0 = Math.hypot(e.pos.x - px, e.pos.y - py);
            const rec = {
              id: e.__spid,
              src: e.__spsrc || 'other',
              forced: !!e.__spforced,
              cls: classify(e), cls0: classify(e),
              type: e.enemyType,
              x: e.pos.x, y: e.pos.y, r: rr,
              // The walk mode AT SPAWN TIME. A run that takes the elevator to a section deck
              // switches the model from the strip to a mask, and judging a deck spawn against the
              // strip's rows would invent failures (or hide them). Every later test uses this.
              mode: mode2,
              t: +(g2.timeAlive || 0).toFixed(2),
              px, py,
              pointOK: !!g2.mapManager.isWalkablePoint(e.pos.x, e.pos.y, mode2),
              footOK: !!g2.mapManager.isWalkableFootprint(e.pos.x, e.pos.y, rr, mode2),
              playerFootOK: !!g2.mapManager.isWalkableFootprint(px, py, 18, mode2),
              d0,
              offscreen: !(e.pos.x >= camX && e.pos.x <= camX + vw && e.pos.y >= camY && e.pos.y <= camY + vh),
              deck: g2.deckOf ? g2.deckOf(e.pos.y) : 'main',
              playerDeck: g2.deckOf ? g2.deckOf(py) : 'main',
              // lifetime tracking, filled below
              minD: d0, maxD: d0, disp: 0, alive: 0, stuck: 0, lastX: e.pos.x, lastY: e.pos.y,
              gone: false, offFrames: 0, framesSeen: 0,
            };
            S.recs.push(rec);
            e.__sprec = rec;
          }
          const rec = e.__sprec;
          if (rec) {
            // Endless promotes an ordinary enemy to MEGA BOSS in place, so the class can change
            // after the spawn. cls0 keeps what it was placed as; cls follows what it became.
            const cnow = classify(e);
            if (cnow !== rec.cls) rec.cls = cnow;
            const d = Math.hypot(e.pos.x - px, e.pos.y - py);
            if (d < rec.minD) rec.minD = d;
            if (d > rec.maxD) rec.maxD = d;
            rec.disp += Math.hypot(e.pos.x - rec.lastX, e.pos.y - rec.lastY);
            rec.lastX = e.pos.x; rec.lastY = e.pos.y;
            rec.stuck = Math.max(rec.stuck, e._stuckT || 0);
            rec.framesSeen++;
            if (!g2.mapManager.isWalkableFootprint(e.pos.x, e.pos.y, e.radius || 14, mode2)) rec.offFrames++;
            rec.alive = +(g2.timeAlive || 0).toFixed(2) - rec.t;
          }
        }
      }
      S.frames++;
      return r;
    };

    return {
      walkMode: mode,
      kind: m?.kind || 'strip',
      rows: m?.rows || null,
      scale: m?.scale ?? null,
      tileW: m?.tileW ?? null,
      tileH: m?.tileH ?? null,
      verticalFloor: !!m?.verticalFloor,
      blocks: (m?.blocks || []).length,
      bandY: m?.rows ? [m.rows[0] * m.scale, m.rows[1] * m.scale] : null,
      walkableBounds: b ? { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 } : null,
    };
  });
  console.log(`  walk model: rows ${JSON.stringify(report.model.rows)} scale ${report.model.scale} ` +
              `→ walkable band y ${report.model.bandY?.map(v => Math.round(v)).join(' .. ')} · ` +
              `${report.model.blocks} block columns · verticalFloor=${report.model.verticalFloor}`);

  // ═══ PHASE A — organic observation ═══════════════════════════════════════════
  console.log(`\n  PHASE A — observing a real Endless run for ${OBS}s of wall time …`);
  const t0 = Date.now();
  let i = 0;
  while ((Date.now() - t0) / 1000 < OBS) {
    if (i % 6 === 0) await clearTutorial(3);      // the overlay eats movement keys while it is up
    const k = ['KeyW', 'KeyD', 'KeyS', 'KeyA', 'KeyD', 'KeyD'][i++ % 6];
    await pg.keyboard.down(k); await sleep(700); await pg.keyboard.up(k); await sleep(30);
    await pg.evaluate(() => {
      const g = window.__spG;
      for (let n = 0; n < 4; n++) {
        if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } continue; }
        if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } continue; }
        if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } continue; }
        break;
      }
      if (g.player && g.player.hp < g.player.maxHp) g.player.hp = g.player.maxHp;
    });
  }
  report.phaseA = await pg.evaluate(() => ({
    gameTime: +(window.__spG.timeAlive || 0).toFixed(1),
    frames: window.__sp.frames,
    recorded: window.__sp.recs.length,
    alive: window.__spG.enemies.length,
  }));
  console.log(`    ${report.phaseA.recorded} spawns recorded over ${report.phaseA.gameTime}s of game time ` +
              `(${report.phaseA.frames} update ticks)`);

  // ═══ PHASE B — forced coverage for the classes the window cannot reach ═══════
  console.log('\n  PHASE B — forced coverage through the shipped entry points …');
  report.phaseB = await pg.evaluate(async () => {
    const g = window.__spG, S = window.__sp;
    const out = { eliteWaves: 0, forcedTypes: {}, note: '' };
    S.forcedNow = true;

    // 1) ELITE WAVES — the shipped function, called verbatim. No arguments, no state changed.
    for (let n = 0; n < 6; n++) { g._spawnEliteWave(); out.eliteWaves++; await new Promise(r => setTimeout(r, 120)); }

    // 2) MINIBOSS / BOSS — the production call is spawnEnemy(type, pos) with `pos` produced by the
    //    real WaveDirector, which is exactly what _updateSpawning does for the 10'/15'/25'
    //    insertions. We only force the TYPE, never the position.
    const WD = g.waveDirector;
    const WDC = WD.constructor;
    const wmode = (typeof WDC.mode === 'function') ? WDC.mode(g) : 'endless';
    out.note = `wave mode "${wmode}"`;
    //    EVERY slot of the plan is used, not just the first — taking plan[0] only would sample one
    //    formation offset and could invent (or hide) a rate that production never sees.
    const types = ['Heavy Mech', 'Security Defector Mech', 'Rogue AI Overlord'];
    for (const type of types) {
      out.forcedTypes[type] = 0;
      for (let n = 0; n < 12; n++) {
        const blk = WD.blockFor(wmode, g.timeAlive || 0);
        const form = WD.activeFormation(blk, 0.016);
        const plan = WD.spawnPlan(form, 4, g.camera, g._viewW, g._viewH);
        for (const p of plan) { g.spawnEnemy(type, { x: p.x, y: p.y }, false); out.forcedTypes[type]++; }
        await new Promise(r => setTimeout(r, 110));
      }
    }
    S.forcedNow = false;
    return out;
  });
  console.log(`    ${report.phaseB.eliteWaves} elite waves + ` +
              Object.entries(report.phaseB.forcedTypes).map(([k, v]) => `${v}× ${k}`).join(', '));

  // let the forced spawns live a while so their movement is measured too
  for (let n = 0; n < 80; n++) {
    if (n % 8 === 0) await clearTutorial(2);
    const k = ['KeyD', 'KeyA'][Math.floor(n / 6) % 2];
    await pg.keyboard.down(k); await sleep(450); await pg.keyboard.up(k); await sleep(30);
    await pg.evaluate(() => {
      const g = window.__spG;
      if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
      if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
      if (g.player && g.player.hp < g.player.maxHp) g.player.hp = g.player.maxHp;
    });
  }

  // ═══ PHASE C — reachability + verdict ════════════════════════════════════════
  console.log('\n  PHASE C — routing every recorded spawn to the player …');
  report.analysis = await pg.evaluate(() => {
    const g = window.__spG, mm = g.mapManager, mode = g._walkMode();
    const recs = window.__sp.recs;

    // BFS over the SHIPPED footprint test. Grid step 32 px; bounded box; hard node cap so a
    // genuinely enclosed spawn terminates instead of walking the infinite strip forever.
    const STEP = 32, CAP = 60000;
    const routeExists = (rec) => {
      const mode = rec.mode;              // the model this spawn was actually placed against
      const r = rec.r;
      const sx = rec.x, sy = rec.y, tx = rec.px, ty = rec.py;
      if (!mm.isWalkableFootprint(sx, sy, r, mode)) return { ok: false, why: 'spawn footprint blocked', nodes: 0 };
      if (!mm.isWalkableFootprint(tx, ty, r, mode)) return { ok: false, why: 'player cell rejects this radius', nodes: 0 };
      const minX = Math.min(sx, tx) - 2600, maxX = Math.max(sx, tx) + 2600;
      const minY = Math.min(sy, ty) - 900, maxY = Math.max(sy, ty) + 900;
      const key = (a, b) => a + ',' + b;
      const seen = new Set([key(0, 0)]);
      const q = [[0, 0]];
      let head = 0, nodes = 0;
      const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      while (head < q.length && nodes < CAP) {
        const [ix, iy] = q[head++]; nodes++;
        const cx = sx + ix * STEP, cy = sy + iy * STEP;
        if (Math.hypot(cx - tx, cy - ty) <= STEP * 1.5) return { ok: true, why: '', nodes };
        for (const [dx, dy] of D) {
          const nx = ix + dx, ny = iy + dy, id = key(nx, ny);
          if (seen.has(id)) continue;
          const wx = sx + nx * STEP, wy = sy + ny * STEP;
          if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue;
          if (!mm.isWalkableFootprint(wx, wy, r, mode)) continue;
          // the step itself must be clear, not just the endpoint
          const mxp = (cx + wx) / 2, myp = (cy + wy) / 2;
          if (!mm.isWalkableFootprint(mxp, myp, r, mode)) continue;
          seen.add(id); q.push([nx, ny]);
        }
      }
      return { ok: false, why: nodes >= CAP ? 'node cap' : 'no route', nodes };
    };

    // Which of the five horizontal zones the endless strip model defines did it land in?
    // Only `band` is connected to the player: the model calls the pavement above y<0 and below
    // y>tileH*scale walkable too, but a no-go strip sits between them and the play band.
    // Zone constants come from the STRIP model, never from whatever model happens to be active
    // when the analysis runs: a run that ends on a section deck has a mask model with no rows,
    // and reading rows[0] off it used to throw here.
    const m = mm._walkModel(String(mode).split(':')[0]) || mm._walkModel(mode);
    const BAND0 = (m?.rows?.[0] ?? 0) * (m?.scale ?? 1);
    const BAND1 = (m?.rows?.[1] ?? 0) * (m?.scale ?? 1);
    const STRIP1 = (m?.tileH ?? 0) * (m?.scale ?? 1);
    // A section deck is a mask with ONE baked component, so 'deck' is its only region. Only the
    // strip has the five-zone geometry.
    const zoneOf = (y, recMode) => (recMode || '').includes(':') ? 'deck'
                        : y < 0 ? 'above' : y < BAND0 ? 'noGoTop' : y <= BAND1 ? 'band'
                        : y <= STRIP1 ? 'noGoBottom' : 'below';

    for (const rec of recs) {
      rec.zone = zoneOf(rec.y, rec.mode);
      const rt = routeExists(rec);
      rec.route = rt.ok;
      rec.routeWhy = rt.why;
      rec.routeNodes = rt.nodes;
      // EMPIRICAL verdict, independent of the model: did it actually come at the player?
      rec.converged = rec.minD <= Math.max(60, rec.d0 * 0.6);
      rec.reached = rec.minD <= (rec.r + 22 + 30);
      rec.stranded = rec.framesSeen >= 90 && rec.disp < 40 && rec.minD > rec.d0 * 0.9;
    }

    const sum = (f) => recs.filter(f).length;
    const byCls = {};
    for (const c of ['trash', 'elite', 'boss', 'mega']) {
      const R = recs.filter(r => r.cls === c);
      byCls[c] = {
        n: R.length,
        footBad: R.filter(r => !r.footOK).length,
        pointBad: R.filter(r => !r.pointOK).length,
        noRoute: R.filter(r => !r.route).length,
        offscreen: R.filter(r => r.offscreen).length,
        converged: R.filter(r => r.converged).length,
        reached: R.filter(r => r.reached).length,
        stranded: R.filter(r => r.stranded).length,
        forced: R.filter(r => r.forced).length,
        medD0: R.length ? R.map(r => r.d0).sort((a, b) => a - b)[Math.floor(R.length / 2)] : null,
        maxD0: R.length ? Math.max(...R.map(r => r.d0)) : null,
        medDisp: R.length ? R.map(r => r.disp).sort((a, b) => a - b)[Math.floor(R.length / 2)] : null,
      };
    }
    const bySrc = {};
    for (const s of ['wave_director', 'elite_wave', 'other']) {
      const R = recs.filter(r => r.src === s);
      bySrc[s] = {
        n: R.length, footBad: R.filter(r => !r.footOK).length, noRoute: R.filter(r => !r.route).length,
        stranded: R.filter(r => r.stranded).length, converged: R.filter(r => r.converged).length,
        medD0: R.length ? Math.round(R.map(r => r.d0).sort((a, b) => a - b)[Math.floor(R.length / 2)]) : null,
        maxD0: R.length ? Math.round(Math.max(...R.map(r => r.d0))) : null,
        medDisp: R.length ? Math.round(R.map(r => r.disp).sort((a, b) => a - b)[Math.floor(R.length / 2)]) : null,
        exY: R.slice(0, 5).map(r => Math.round(r.y)),
      };
    }
    const badExamples = recs.filter(r => !r.footOK || !r.route || r.stranded).slice(0, 12).map(r =>
      `${r.cls}/${r.src}${r.forced ? '(forced)' : ''} ${r.type} @(${Math.round(r.x)},${Math.round(r.y)}) r=${Math.round(r.r)} ` +
      `foot=${r.footOK} pt=${r.pointOK} route=${r.route}${r.routeWhy ? '(' + r.routeWhy + ')' : ''} ` +
      `d0=${Math.round(r.d0)} minD=${Math.round(r.minD)} disp=${Math.round(r.disp)} stuck=${r.stuck.toFixed(1)} frames=${r.framesSeen}`);

    const hist = (key, filter = () => true) => {
      const h = {};
      for (const r of recs) if (filter(r)) h[r[key]] = (h[r[key]] || 0) + 1;
      return h;
    };
    const zoneTable = {};
    for (const z of ['above', 'noGoTop', 'band', 'noGoBottom', 'below', 'deck']) {
      const R = recs.filter(r => r.zone === z);
      zoneTable[z] = { n: R.length, footBad: R.filter(r => !r.footOK).length,
                       noRoute: R.filter(r => !r.route).length,
                       reached: R.filter(r => r.reached).length,
                       srcs: [...new Set(R.map(r => r.src))] };
    }

    return {
      band: [BAND0, BAND1], strip: STRIP1,
      zoneTable,
      byRadius: Object.fromEntries([...new Set(recs.map(r => Math.round(r.r)))].sort((a, b) => a - b).map(rad => {
        const R = recs.filter(r => Math.round(r.r) === rad);
        return [rad, { n: R.length, outOfBand: R.filter(r => r.zone !== 'band').length,
                       noRoute: R.filter(r => !r.route).length,
                       viaDirector: R.filter(r => r.src === 'wave_director').length,
                       directorOutOfBand: R.filter(r => r.src === 'wave_director' && r.zone !== 'band').length }];
      })),
      routeWhy: hist('routeWhy', r => !r.route),
      routeWhyByCls: Object.fromEntries(['trash', 'elite', 'boss', 'mega'].map(c =>
        [c, hist('routeWhy', r => !r.route && r.cls === c)])),
      zoneByCls: Object.fromEntries(['trash', 'elite', 'boss', 'mega'].map(c =>
        [c, hist('zone', r => r.cls === c)])),
      recs: recs.map(r => ({ id: r.id, src: r.src, forced: r.forced, cls: r.cls, cls0: r.cls0,
        type: r.type, x: Math.round(r.x), y: Math.round(r.y), r: r.r, zone: r.zone,
        footOK: r.footOK, pointOK: r.pointOK, route: r.route, why: r.routeWhy,
        d0: Math.round(r.d0), minD: Math.round(r.minD), disp: Math.round(r.disp),
        frames: r.framesSeen, offFrames: r.offFrames, stuck: +r.stuck.toFixed(1),
        converged: r.converged, reached: r.reached, stranded: r.stranded, offscreen: r.offscreen })),
      total: recs.length,
      footBad: sum(r => !r.footOK),
      pointBad: sum(r => !r.pointOK),
      noRoute: sum(r => !r.route),
      offscreen: sum(r => r.offscreen),
      offscreenAndFine: sum(r => r.offscreen && r.footOK && r.route),
      converged: sum(r => r.converged),
      reached: sum(r => r.reached),
      stranded: sum(r => r.stranded),
      everOffFloor: sum(r => r.offFrames > 0),
      shortLived: sum(r => r.framesSeen < 90),
      byCls, bySrc, badExamples,
      playerFootAlwaysOK: sum(r => !r.playerFootOK) === 0,
    };
  });

  const a = report.analysis;
  const pc = (n) => a.total ? `${(n * 100 / a.total).toFixed(1)}%` : '0%';
  console.log('\n══════════════ ENDLESS SPAWN PLACEMENT — RUNTIME ══════════════');
  console.log(`  build ${BUILD} · walkMode "${report.model.walkMode}" · band y ${report.model.bandY?.map(v => Math.round(v)).join('..')}`);
  console.log(`  spawns measured        ${a.total}   (organic ${a.total - Object.values(report.analysis.byCls).reduce((s, c) => s + c.forced, 0)} + forced ${Object.values(report.analysis.byCls).reduce((s, c) => s + c.forced, 0)})`);
  console.log(`  footprint NOT walkable ${a.footBad}  (${pc(a.footBad)})     centre point not walkable ${a.pointBad}`);
  console.log(`  no route to player     ${a.noRoute}  (${pc(a.noRoute)})`);
  console.log(`  offscreen at spawn     ${a.offscreen}  (${pc(a.offscreen)})  — of which walkable AND routed: ${a.offscreenAndFine}`);
  console.log(`  came at the player     converged ${a.converged}  ·  actually reached contact ${a.reached}`);
  console.log(`  STRANDED (empirical)   ${a.stranded}  (${pc(a.stranded)})   [>=90 ticks alive, <40px travelled, never got closer]`);
  console.log(`  ever stood off floor   ${a.everOffFloor}`);
  console.log('\n  by class      n      footBad  noRoute  offscr  converged  reached  stranded  forced   medD0  maxD0  medDisp');
  for (const [c, v] of Object.entries(a.byCls)) {
    console.log(`    ${c.padEnd(6)} ${String(v.n).padStart(6)} ${String(v.footBad).padStart(9)} ${String(v.noRoute).padStart(8)} ${String(v.offscreen).padStart(7)} ${String(v.converged).padStart(10)} ${String(v.reached).padStart(8)} ${String(v.stranded).padStart(9)} ${String(v.forced).padStart(7)} ${String(Math.round(v.medD0 ?? 0)).padStart(7)} ${String(Math.round(v.maxD0 ?? 0)).padStart(6)} ${String(Math.round(v.medDisp ?? 0)).padStart(8)}`);
  }
  console.log('\n  by spawn path       n    footBad  noRoute  stranded  converged   medD0   maxD0  medDisp   first y values');
  for (const [s, v] of Object.entries(a.bySrc)) {
    console.log(`    ${s.padEnd(14)} ${String(v.n).padStart(6)} ${String(v.footBad).padStart(8)} ${String(v.noRoute).padStart(8)} ${String(v.stranded).padStart(9)} ${String(v.converged).padStart(10)} ${String(v.medD0).padStart(7)} ${String(v.maxD0).padStart(7)} ${String(v.medDisp).padStart(8)}   ${JSON.stringify(v.exY)}`);
  }
  console.log(`\n  the endless strip has ${report.model.blocks} obstacle columns — walkability is the horizontal band alone.`);
  console.log(`  zones:  above y<0  ·  NO-GO 0..${a.band[0]}  ·  BAND ${a.band[0]}..${a.band[1]}  ·  NO-GO ..${a.strip}  ·  below y>${a.strip}`);
  console.log('  zone          n    footBad  noRoute  reached   spawn paths that put enemies there   (deck = on a section deck, one baked component)');
  for (const [z, v] of Object.entries(a.zoneTable)) {
    console.log(`    ${z.padEnd(11)} ${String(v.n).padStart(5)} ${String(v.footBad).padStart(9)} ${String(v.noRoute).padStart(8)} ${String(v.reached).padStart(8)}   ${v.srcs.join(', ') || '-'}`);
  }
  console.log('\n  by enemy radius (wave-director path only, the one that calls resolveEnemySpawn):');
  console.log('    r      total   outOfBand   noRoute    viaDirector   directorOutOfBand');
  for (const [rad, v] of Object.entries(a.byRadius)) {
    console.log(`    ${String(rad).padStart(3)} ${String(v.n).padStart(8)} ${String(v.outOfBand).padStart(11)} ${String(v.noRoute).padStart(9)} ${String(v.viaDirector).padStart(14)} ${String(v.directorOutOfBand).padStart(19)}`);
  }
  console.log(`\n  reason a route was not found: ${JSON.stringify(a.routeWhy)}`);
  console.log(`  by class:                     ${JSON.stringify(a.routeWhyByCls)}`);
  console.log(`  zone by class:                ${JSON.stringify(a.zoneByCls)}`);
  if (a.badExamples.length) {
    console.log('\n  examples of every spawn that failed anything:');
    for (const e of a.badExamples) console.log('    ' + e);
  } else {
    console.log('\n  no spawn failed footprint, route or the empirical stranding test.');
  }
  console.log(`\n  page errors ${report.pageErrors.length} · console errors ${report.consoleErrors.length}`);
  if (report.pageErrors[0]) console.log('    pageError[0]: ' + report.pageErrors[0]);

  const real = a.footBad + a.noRoute + a.stranded;
  console.log('\n  ' + (real === 0
    ? 'ENDLESS SPAWN PLACEMENT: FALSE POSITIVE'
    : `ENDLESS SPAWN PLACEMENT: REAL — ${a.footBad} bad footprint / ${a.noRoute} unroutable / ${a.stranded} stranded of ${a.total}`));
  console.log('═══════════════════════════════════════════════════════════════\n');

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`  report: ${path.join(OUT, 'report.json')}`);
  await ctx.close(); await br.close(); srv.close();
  process.exit(0);
});
