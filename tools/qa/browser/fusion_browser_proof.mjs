// ════════════════════════════════════════════════════════════════════════════════
// FUSION ARMORY — Chromium runtime acceptance (Batch F).
// Playwright driver πάνω στο ΠΡΑΓΜΑΤΙΚΟ build (ίδιο module instance μέσω import
// με το production ?v). Τρία μέρη:
//  A. Ανά χαρακτήρα (10): πραγματικό Endless/Chaos run σε ζωντανό rAF loop —
//     canonical purchase → 3-weapon recipe → guaranteed κάρτα → acquisition →
//     πραγματικό damage → kills → art ορατό → cleanup στο reset.
//  B. Και τα 20 fusions: deterministic driven lifecycle — φάσεις, damage, kills,
//     screenshots (activation / impact / aftermath) από το πραγματικό canvas.
//  C. Stress: πυκνό Endless + πυκνό Chaos με 2 fusions + κοινά όπλα — frame
//     times (avg/worst/p95), active objects, cleanup μετά από restart.
// Run: node tools/qa/browser/fusion_browser_proof.mjs [port]
// Γράφει: /tmp/fusion_proof/report.json + screenshots.
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = '/tmp/fusion_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8930;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg',
               '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const report = { build: BUILD, when: 'batch F', A: [], B: [], C: {}, consoleErrors: [], fusion404: [] };

function ok(section, name, cond, note = '') {
  const entry = { name, pass: !!cond, note };
  section.push(entry);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${note && !cond ? ' — ' + note : ''}`);
  return !!cond;
}

srv.listen(PORT, async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: 1280, height: 800 } });
  pg.on('pageerror', e => report.consoleErrors.push('PAGE ' + e.message));
  pg.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
  pg.on('response', r => { if (r.status() === 404 && r.url().includes('fusions')) report.fusion404.push(r.url()); });
  await pg.addInitScript(() => { try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {} });
  await pg.goto(`http://localhost:${PORT}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForTimeout(4500);
  // gesture για audio context
  await pg.mouse.click(640, 400).catch(() => {});

  // Ζωντανό instance: ίδιο module specifier με το production → patch στο prototype
  const hooked = await pg.evaluate(async (build) => {
    const mod = await import('./js/game/Game.js?v=' + build);
    const G = mod.Game;
    if (!window.__fusLive) {
      const orig = G.prototype.update;
      G.prototype.update = function (...a) { window.__fusG = this; return orig.apply(this, a); };
      window.__fusLive = true;
    }
    return true;
  }, BUILD);
  console.log('module hook:', hooked);
  // Περίμενε να πιαστεί το ζωντανό instance από το πραγματικό rAF loop
  await pg.waitForFunction(() => !!window.__fusG, undefined, { timeout: 20000 });

  const helpers = `
    const g = window.__fusG;
    const fe = g && g.fusionEngine, rt = g && g.buildEngine;
    function grant(fid) {
      const d = fe.constructorDefs ? null : null;
      const FD = window.__fusDefs[fid];
      for (let k = 0; k < FD.components.length; k++) {
        const cid = FD.components[k], need = [5,3,3][k];
        for (let n = 0; n < need; n++) rt.addWeapon(cid);
        const w = rt.weapons.get(cid);
        if (!w) g._weaponLevels.set(cid, need);
        else while (w.level < need) w.level++;
      }
    }
  `;
  await pg.evaluate(async (build) => {
    const FC = await import('./js/game/FusionCatalog.js?v=20260902020000');
    window.__fusDefs = FC.FUSION_DEFS;
    window.__fusOrder = FC.FUSION_CARD_ORDER;
  });

  const CHARS = await pg.evaluate(() => {
    const per = {};
    for (const fid of window.__fusOrder) {
      const c = window.__fusDefs[fid].char;
      (per[c] = per[c] || []).push(fid);
    }
    return per;
  });

  // ── PART A: πραγματικό run ανά χαρακτήρα (ζωντανό rAF — καμία driven βοήθεια) ──
  console.log('── A. Per-character live runs');
  let chIdx = 0;
  for (const [charId, fids] of Object.entries(CHARS)) {
    const useChaos = (chIdx++ % 2) === 1;             // 5 Endless / 5 Chaos
    const fid = fids[0];
    const res = await pg.evaluate(async ({ fid, charId, useChaos, helpers }) => {
      const g = window.__fusG;
      if (!g) return { err: 'no live game' };
      g.selectedCharacter = charId;
      g.gameState = 'playing';
      g.reset();
      g._enterEndless();
      if (useChaos) g._chaosMode = true;
      const fe = g.fusionEngine, rt = g.buildEngine;
      if (!fe || !rt) return { err: 'no engines' };
      g.meta.endlessUnlocked = true;
      g.meta.protocolFragments = 500; g.meta.credits = 50000;
      const buy = g.meta.tryBuyFusionCard(fid);
      const FD = window.__fusDefs[fid];
      for (let k = 0; k < FD.components.length; k++) {
        const cid = FD.components[k], need = [5, 3, 3][k];
        for (let n = 0; n < need; n++) rt.addWeapon(cid);
        const w = rt.weapons.get(cid);
        if (!w) g._weaponLevels.set(cid, need);
        else while (w.level < need) w.level++;
      }
      const eligible = fe.eligibleFusions().includes(fid);
      const choices = [{}, {}, {}];
      g._injectWeaponCard(choices);
      const cardKey = choices[2] && choices[2].key;
      if (cardKey === 'fusion_' + fid) choices[2].apply(g.player);
      const acquired = fe.active.has(fid);
      // 22s ΖΩΝΤΑΝΟ rAF — ο upgradeUI αυτο-επιλέγεται για να μην παγώσει το run
      const t0 = performance.now();
      await new Promise(resolve => {
        const iv = setInterval(() => {
          if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) {} }
          if (performance.now() - t0 > 22000 || g.gameOver) { clearInterval(iv); resolve(); }
        }, 120);
      });
      const log = rt.log.byWeapon.get(fid);
      const canvas = document.getElementById('game');
      let lit = 0;
      try {
        const x = canvas.getContext('2d');
        const img = x.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i2 = 0; i2 < img.length; i2 += 4 * 97) if (img[i2] + img[i2 + 1] + img[i2 + 2] > 24) lit++;
      } catch (_) {}
      const artOk = fe.artOk(fid);
      const activeBefore = fe.active.size;
      g.reset(); g._enterEndless();
      const cleanAfterReset = g.fusionEngine.active.size === 0 && g.fusionEngine !== fe;
      return {
        buy, eligible, cardKey, acquired,
        dmg: log ? Math.round(log.total) : 0, kills: log ? log.kills : 0, hits: log ? log.hits : 0,
        artOk, lit, activeBefore, cleanAfterReset, mode: useChaos ? 'chaos' : 'endless',
      };
    }, { fid, charId, useChaos, helpers });
    const section = [];
    ok(section, `${charId}/${fid} [${res.mode}] purchase+eligibility+card`, res.buy === 'ok' && res.eligible && res.cardKey === 'fusion_' + fid, JSON.stringify(res).slice(0, 200));
    ok(section, `${charId}/${fid} acquired + REAL damage + kills (live rAF)`, res.acquired && res.dmg > 0 && res.kills > 0, `dmg=${res.dmg} kills=${res.kills}`);
    ok(section, `${charId}/${fid} art loaded in gameplay + canvas lit + cleanup`, res.artOk && res.lit > 30 && res.cleanAfterReset, `lit=${res.lit}`);
    report.A.push({ charId, fid, ...res, checks: section });
  }

  // ── PART B: deterministic lifecycle & screenshots για ΟΛΑ τα 20 ────────────────
  console.log('── B. All-20 deterministic lifecycle + screenshots');
  const allFids = await pg.evaluate(() => window.__fusOrder);
  for (const fid of allFids) {
    const res = await pg.evaluate(async ({ fid }) => {
      const g = window.__fusG;
      const FD = window.__fusDefs[fid];
      g.selectedCharacter = FD.char;
      g.gameState = 'playing';
      g.reset(); g._enterEndless();
      const fe = g.fusionEngine, rt = g.buildEngine;
      g.meta.endlessUnlocked = true; g.meta.protocolFragments = 500; g.meta.credits = 50000;
      g.meta.tryBuyFusionCard(fid);
      for (let k = 0; k < FD.components.length; k++) {
        const cid = FD.components[k], need = [5, 3, 3][k];
        for (let n = 0; n < need; n++) rt.addWeapon(cid);
        const w = rt.weapons.get(cid);
        if (!w) g._weaponLevels.set(cid, need);
        else while (w.level < need) w.level++;
      }
      const choices = [{}, {}, {}];
      g._injectWeaponCard(choices);
      if (!choices[2] || choices[2].key !== 'fusion_' + fid) return { err: 'no card' };
      choices[2].apply(g.player);
      const phases = new Set();
      const shots = {};
      const IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
      const canvas = document.getElementById('game');
      const snap = (label) => {
        try { g.draw(canvas.getContext('2d')); shots[label] = canvas.toDataURL('image/png'); } catch (_) {}
      };
      let impactShot = false, aftermathShot = false;
      snap('activation');
      for (let f = 0; f < 45 * 60; f++) {
        g.update(1 / 60, IN);
        if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) {} }
        const st = fe.active.get(fid);
        if (st) {
          phases.add(st.phase);
          if (!impactShot && ['rift', 'storm', 'feast', 'detonate', 'corridor', 'active', 'field', 'web', 'roll', 'core', 'set', 'wheel', 'guard', 'embedded', 'ring', 'march', 'flight', 'dive', 'orbit'].includes(st.phase) && st.cycle === 0 && f > 200) {
            snap('impact'); impactShot = true;
          }
          if (!aftermathShot && st.cycle >= 1) { snap('aftermath'); aftermathShot = true; }
        }
        if (aftermathShot && f > 20 * 60) break;
        if (g.gameOver) break;
      }
      const st = fe.active.get(fid);
      const log = rt.log.byWeapon.get(fid);
      // deterministic full-cycle απόδειξη: τουλάχιστον ένας ΠΛΗΡΗΣ κύκλος
      return {
        phases: [...phases], cycles: st ? st.cycle : -1,
        dmg: log ? Math.round(log.total) : 0, kills: log ? log.kills : 0,
        errs: st ? (st._errs || 0) : -1,
        shots,
      };
    }, { fid });
    if (res.err) { ok(report.B, `${fid} lifecycle`, false, res.err); continue; }
    const section = [];
    ok(section, `${fid} full cycle proven (cycles=${res.cycles}, phases=${res.phases.join('/')})`, res.cycles >= 1 && res.errs === 0);
    ok(section, `${fid} damage+kills (driven)`, res.dmg > 0 && res.kills > 0, `dmg=${res.dmg} kills=${res.kills}`);
    let saved = 0;
    for (const [label, dataUrl] of Object.entries(res.shots || {})) {
      try {
        fs.writeFileSync(path.join(OUT, `${fid}_${label}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
        saved++;
      } catch (_) {}
    }
    ok(section, `${fid} screenshots saved (${saved})`, saved >= 2);
    report.B.push({ fid, cycles: res.cycles, phases: res.phases, dmg: res.dmg, kills: res.kills, shots: saved, checks: section });
  }

  // ── PART C: stress — ΣΥΓΚΡΙΤΙΚΟ: ίδιο πυκνό σενάριο ΧΩΡΙΣ και ΜΕ 2 fusions ─────
  // Το απόλυτο frame time μετρά το μηχάνημα (το cloud κάνει software raster) —
  // το ζητούμενο είναι το fusion OVERHEAD: fusion p95 ≤ baseline p95 × 1.15.
  console.log('── C. Stress (baseline vs fusions)');
  for (const mode of ['endless', 'chaos']) {
    const run = (withFusions) => pg.evaluate(async ({ mode, withFusions }) => {
      const g = window.__fusG;
      const charId = 'skeleton_warrior';
      g.selectedCharacter = charId;
      g.gameState = 'playing';
      g.reset(); g._enterEndless();
      if (mode === 'chaos') g._chaosMode = true;
      const fe = g.fusionEngine, rt = g.buildEngine;
      g.meta.endlessUnlocked = true; g.meta.protocolFragments = 500; g.meta.credits = 50000;
      if (withFusions) {
        const fids = window.__fusOrder.filter(f => window.__fusDefs[f].char === charId);
        for (const fid of fids) {
          g.meta.tryBuyFusionCard(fid); g.meta.tryBuyFusionCard(fid); g.meta.tryBuyFusionCard(fid);
          const FD = window.__fusDefs[fid];
          for (let k = 0; k < FD.components.length; k++) {
            const cid = FD.components[k], need = [5, 3, 3][k];
            for (let n = 0; n < need; n++) rt.addWeapon(cid);
            const w = rt.weapons.get(cid);
            if (!w) g._weaponLevels.set(cid, need);
            else while (w.level < need) w.level++;
          }
          const ch = [{}, {}, {}];
          g._injectWeaponCard(ch);
          if (ch[2] && ch[2].key === 'fusion_' + fid) ch[2].apply(g.player);
        }
      }
      g.timeAlive = 900;                              // πυκνός director βαθιά στο run
      const IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
      const canvas = document.getElementById('game');
      const ctx2 = canvas.getContext('2d');
      const frames = [];
      const memBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;
      let maxEnemies = 0, maxFx = 0, maxObjects = 0, fusionDmg = 0;
      for (let f = 0; f < 30 * 60; f++) {
        const t0 = performance.now();
        g.update(1 / 60, IN);
        g.draw(ctx2);
        frames.push(performance.now() - t0);
        if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) {} }
        // perf harness: ο ακίνητος παίκτης δεν πρέπει να πεθάνει στη μέτρηση
        // (ίδια μεταχείριση σε baseline & fusion run — δίκαιη σύγκριση)
        if (g.player) g.player.hp = g.player.maxHp;
        maxEnemies = Math.max(maxEnemies, g.enemies.length);
        if (withFusions && fe) {
          maxFx = Math.max(maxFx, fe.fx.length);
          for (const st of fe.active.values()) {
            for (const v of Object.values(st.objects || {})) {
              if (Array.isArray(v)) maxObjects = Math.max(maxObjects, v.length);
            }
          }
        }
        if (g.gameOver) { g.reset(); g._enterEndless(); if (mode === 'chaos') g._chaosMode = true; g.timeAlive = 900; }
      }
      frames.sort((a, b) => a - b);
      const q = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))];
      const memAfter = performance.memory ? performance.memory.usedJSHeapSize : 0;
      if (withFusions && g.buildEngine) {
        for (const [id2, w2] of g.buildEngine.log.byWeapon) if (String(id2).startsWith('fus_')) fusionDmg += w2.total;
      }
      const cleanRef = g.fusionEngine;
      g.reset(); g._enterEndless();
      const cleanAfter = g.fusionEngine !== cleanRef && g.fusionEngine.active.size === 0;
      return {
        avg: frames.reduce((a, b) => a + b, 0) / frames.length,
        p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: frames[frames.length - 1],
        over50: frames.filter(x => x > 50).length,
        maxEnemies, maxFx, maxObjects, cleanAfter, fusionDmg: Math.round(fusionDmg),
        memGrowthMB: memBefore && memAfter ? Math.round((memAfter - memBefore) / 1048576) : null,
      };
    }, { mode, withFusions });
    const base = await run(false);
    const fus = await run(true);
    const section = [];
    const ratio = fus.p95 / Math.max(0.001, base.p95);
    ok(section, `stress ${mode}: fusion overhead p95 ×${ratio.toFixed(2)} (base ${base.p95.toFixed(1)}ms → fusion ${fus.p95.toFixed(1)}ms, worst ${fus.worst.toFixed(1)}ms)`, ratio <= 1.15);
    ok(section, `stress ${mode}: 2 fusions ενεργά + πραγματικό damage υπό πίεση (dmg=${fus.fusionDmg})`, fus.fusionDmg > 0);
    ok(section, `stress ${mode}: bounded (enemies≤${fus.maxEnemies}, fx≤${fus.maxFx}, obj≤${fus.maxObjects}) + cleanup + mem ${fus.memGrowthMB}MB`, fus.maxFx <= 60 && fus.maxObjects <= 40 && fus.cleanAfter && (fus.memGrowthMB === null || fus.memGrowthMB < 300));
    report.C[mode] = { baseline: base, fusion: fus, ratio, checks: section };
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const allChecks = [...report.A.flatMap(a => a.checks || []), ...report.B.flatMap(b => b.checks || []),
                     ...Object.values(report.C).flatMap(c => c.checks || [])];
  const passN = allChecks.filter(c => c.pass).length;
  console.log(`\nfusion 404s: ${report.fusion404.length} | console errors: ${report.consoleErrors.length}`);
  if (report.consoleErrors.length) console.log(report.consoleErrors.slice(0, 6));
  console.log(`=== ${passN} PASS / ${allChecks.length - passN} FAIL === (report: ${path.join(OUT, 'report.json')})`);
  await br.close();
  srv.close();
  process.exit(allChecks.length - passN > 0 || report.fusion404.length ? 1 : 0);
});
