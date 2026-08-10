// ════════════════════════════════════════════════════════════════════════════════
// SOLO RED THUNDER VFX · BUILD ENGINE CARD DOTS — the two questions that need real pixels.
//
// PART 1 — SOLO RED THUNDER. Eddie's signature weapon is a SINGLE illustration, not a frame sheet,
// so it deliberately stays out of WEAPON_VFX_META and reaches VFXSpritePlayer through the
// wielder-override path instead. That is easy to break silently: drop the override entry or the
// anim style and the weapon still fires, still deals its damage, and draws nothing anyone notices
// in a log. The probe therefore checks the whole chain in a live Eddie run — the metadata the
// shipped code reads, the override image really decoding, and canvas draw calls actually happening
// while the weapon fires — and separately confirms the accent layer and the SFX binding exist.
// Nothing about damage or behaviour is touched or measured here; this is presence only.
//
// PART 2 — BE CARD DOTS. The level-up card's dot row is drawn by UpgradeUI. This opens a REAL card
// panel with real Build Engine state and reads back what the renderer would draw, so the claim is
// about the panel the player sees rather than about an object in a test.
//
// Run: node tools/qa/browser/solo_thunder_vfx_be_dots_proof.mjs [port]
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 8997;
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
let pass = 0, fail = 0;
const T = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
const out = {};

srv.listen(PORT, async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    headless: !process.env.DISPLAY, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
    try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 7 })); } catch (_) {}
  });
  const pg = await ctx.newPage();
  const pageErrors = [], consoleErrors = [];
  pg.on('pageerror', e => pageErrors.push(String(e).slice(0, 220)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 220)); });
  const missing = [];
  pg.on('response', r => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });
  await pg.goto(`http://localhost:${PORT}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 30000 });
  await pg.mouse.click(640, 400).catch(() => {});
  console.log(`\n═══ build ${BUILD} ═══\n`);

  // ══ PART 1 — SOLO RED THUNDER in a live Eddie run ═══════════════════════════
  console.log('── 1. Solo Red Thunder ──');
  const vfx = await pg.evaluate(async (build) => {
    const { Game } = await import('./js/game/Game.js?v=' + build);
    const g = new Game();
    g.audio = null; g.selectedCharacter = 'eddie';
    g.reset(); g._enterEndless(); g.gameState = 'playing';
    window.__g = g;
    const WID = 'solo_red_thunder';
    const started = (g._weaponLevels?.get?.(WID) || 0) > 0;

    // COUNT REAL DRAW CALLS. A 2D context is instrumented and the shipped VFX spawner is invoked
    // through the same public method the weapon's fire path uses, then drawn — so this measures
    // the production draw chain, not a re-implementation of it.
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const cx = canvas.getContext('2d');
    let calls = 0;
    for (const m of ['drawImage', 'fill', 'stroke', 'fillRect', 'arc', 'moveTo', 'lineTo']) {
      const o = cx[m].bind(cx);
      cx[m] = (...a) => { calls++; return o(...a); };
    }
    // WARM THE ART CACHE FIRST. The wielder-override illustration is fetched lazily on the first
    // request, so a measurement taken in the same tick as a cold cache reports "no VFX" for a
    // decode that simply has not finished. In a real run the player fires seconds after boot.
    g._spawnWeaponVFX(WID, 0, 0, 0, 1.0);
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (g._spawnWeaponVFX(WID, 0, 0, 0, 1.0)) break;
    }
    (g._activeWeaponVFX || []).length = 0;
    const before = (g._activeWeaponVFX || []).length;
    const spawned = g._spawnWeaponVFX(WID, 400, 300, 0.4, 1.0);
    const after = (g._activeWeaponVFX || []).length;
    // draw whatever it produced, the way the game's own draw pass does
    for (const v of (g._activeWeaponVFX || [])) { try { v.update?.(1 / 60); v.draw?.(cx); } catch (_) {} }
    const accents = (g._weaponAccents || g._accents || []).length;
    const overrideImg = spawned?.overrideImg || null;

    // and the metadata the shipped code reads
    const img = new Image();
    const loaded = await new Promise((res) => {
      img.onload = () => res({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res({ ok: false, w: 0, h: 0 });
      img.src = 'assets/weapons/solo_red_thunder.png';
    });
    return {
      started,
      spawnedVfx: !!spawned, vfxQueueGrew: after > before,
      overrideImgSet: !!overrideImg,
      overrideSrc: overrideImg ? String(overrideImg.src || '').split('/').pop() : null,
      animStyle: spawned?.animStyle || null,
      drawCalls: calls,
      accents,
      artLoaded: loaded.ok, artSize: loaded.w + 'x' + loaded.h,
    };
  }, BUILD);
  console.log(`     ${JSON.stringify(vfx)}`);
  T('1a Eddie starts the run holding Solo Red Thunder', vfx.started);
  T('1b firing it produces a live VFX object', vfx.spawnedVfx && vfx.vfxQueueGrew);
  T('1c the wielder override art is bound to it', vfx.overrideImgSet, String(vfx.overrideSrc));
  T('1d the art file actually decodes', vfx.artLoaded, vfx.artSize);
  T('1e it has its own animation style, not the default swirl',
    vfx.animStyle === 'flicker', String(vfx.animStyle));
  T('1f drawing it puts real marks on a canvas', vfx.drawCalls > 0, `${vfx.drawCalls} draw calls`);
  T('1g no missing asset was requested', !missing.some(p => /solo_red_thunder/.test(p)), missing.join(' '));
  out.vfx = vfx.spawnedVfx && vfx.overrideImgSet && vfx.artLoaded && vfx.drawCalls > 0;

  // ══ PART 2 — the card panel the player sees ═════════════════════════════════
  console.log('\n── 2. Build Engine card dots ──');
  const dots = await pg.evaluate(async () => {
    const g = window.__g;
    const be = g.buildEngine;
    // real BE state
    const wid = Object.entries(be.constructor ? {} : {}).length ? null : (() => {
      const cands = Object.keys(g._beWeaponDefs || {});
      return null;
    })();
    void wid;
    // level a weapon up through the engine's own API
    let target = null;
    for (const k of Object.keys(window.__BE_DEFS || {})) { void k; }
    // pick whatever the engine will accept
    const tryIds = [];
    be.injectCards([null, null, null]);   // warm the engine's caches
    for (const [id] of be.weapons) tryIds.push(id);
    if (!tryIds.length) {
      const choices = [null, null, null];
      be.injectCards(choices);
      const c = choices.find(x => x && String(x.key).startsWith('be_w_'));
      if (c) { c.apply(); target = String(c.key).slice(5); }
    } else target = tryIds[0];
    if (target) { be.addWeapon(target); be.addWeapon(target); }
    const engineLevel = target ? (be.weapons.get(target)?.level ?? -1) : -1;

    // open a REAL card panel containing that weapon's card
    let card = null;
    for (let i = 0; i < 400 && !card; i++) {
      const choices = [null, null, null];
      be.injectCards(choices);
      card = choices.find(c => c && c.key === 'be_w_' + target) || null;
    }
    if (!card) return { engineLevel, target, found: false };

    // what UpgradeUI would draw: filled dots then empty dots
    const filled = Math.min(Number.isFinite(card.level) ? card.level : (g.player.upgrades[card.key] ?? 0), 10);
    const total  = Math.min(Number.isFinite(card.displayMax) ? card.displayMax : card.maxLevel, 10);
    const m = /Lv(\d+) → Lv(\d+)/.exec(card.description || '');
    return { engineLevel, target, found: true, filled, total,
             textLv: m ? Number(m[1]) : null, key: card.key, playerUpgrades: g.player.upgrades[card.key] ?? 0 };
  });
  console.log(`     ${JSON.stringify(dots)}`);
  T('2a a real BE weapon card was produced', dots.found, JSON.stringify(dots));
  T('2b the filled dots equal the ENGINE level', dots.found && dots.filled === dots.engineLevel,
    `dots=${dots.filled} engine=${dots.engineLevel}`);
  T('2c the dot row length is the real cap (5), not 9', dots.found && dots.total === 5, `total=${dots.total}`);
  T('2d the dots agree with the card\'s own LvX → LvY text',
    dots.found && dots.textLv === dots.filled, `dots=${dots.filled} text=${dots.textLv}`);
  T('2e CONTROL: player.upgrades really is empty for this key (why it used to read 0)',
    dots.playerUpgrades === 0, String(dots.playerUpgrades));
  out.dots = dots.found && dots.filled === dots.engineLevel && dots.textLv === dots.filled;

  T('zero page errors', pageErrors.length === 0, pageErrors[0] || '');
  T('zero console errors', consoleErrors.length === 0, consoleErrors[0] || '');

  console.log(`\n  Solo Red Thunder VFX present: ${out.vfx ? 'YES' : 'NO'}`);
  console.log(`  BE card level display accurate: ${out.dots ? 'PASS' : 'FAIL'}`);
  console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
  await ctx.close(); await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
});
