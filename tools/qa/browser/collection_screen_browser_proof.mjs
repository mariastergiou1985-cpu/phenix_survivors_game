// COLLECTION SCREEN REDESIGN — browser proof (cloud Playwright, real Chromium)
// Pattern: char_select_redesign_browser_proof. Serves site/ on 127.0.0.1:8137,
// grabs the LIVE Game instance via a one-shot Game.prototype.update hook (same
// module specifier ?v=20260903040000 → same module instance), then drives the
// REAL DOM + REAL keyboard paths and checks the UI against the same catalogs
// and MetaProgress gates the game enforces.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8137';
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.COL_PROOF_SHOTS || '/tmp/collection_proof_shots';
const BUILD = '20260904050000';

let passN = 0, failN = 0;
const failures = [];
function check(id, cond, extra) {
  if (cond) { passN++; console.log(`PASS ${id}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // CDP screenshots — page.screenshot() hangs on "waiting for fonts" with the
  // offline font stub (same workaround as char_select_redesign_browser_proof).
  const cdp = await page.context().newCDPSession(page);
  // Real taps span >=1 game frame (controller padTap releases NEXT frame). An
  // instant down+up inside one frame is a harness artifact, so hold briefly.
  const tap = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(160); };
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/' + name, Buffer.from(data, 'base64'));
  };

  const pageErrors = [], consoleErrors = [], notFound = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;   // 404s tracked via response hook below
    consoleErrors.push(t);
  });
  page.on('response', r => { if (r.status() === 404) notFound.push(new URL(r.url()).pathname); });

  // External fonts stall 'load' behind the cloud proxy — block them (fallback fonts ok)
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/fonts\.googleapis/.test(u)) return r.fulfill({ status: 200, contentType: 'text/css', body: '/* offline proof — system fallback fonts */' });
    return r.abort();
  });
  await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cgm-overlay', { timeout: 15000 });
  await page.waitForTimeout(1200);

  // ── Grab the live Game instance (one-shot prototype hook, same module) ──
  await page.evaluate(async (build) => {
    const mod = await import(`./js/game/Game.js?v=${build}`);
    await new Promise((res) => {
      const orig = mod.Game.prototype.update;
      mod.Game.prototype.update = function (...a) {
        window.__g = this;
        mod.Game.prototype.update = orig;
        res();
        return orig.apply(this, a);
      };
    });
  }, BUILD);
  const haveG = await page.evaluate(() => !!window.__g && !!window.__g.meta);
  check('A01 live Game instance captured', haveG);

  // ── A. Boot health ──
  check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('A03 zero non-404 console errors at boot', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  const staged404 = notFound.filter(p => /assets\/(characters|unlocks\/secret_skins|weapons\/fusions)\//.test(p));
  check('A04 zero 404s for collection art (staged set)', staged404.length === 0, staged404.slice(0, 5).join(' | '));

  // ── B. Enter COLLECTIBLES from the real menu ──
  await page.click('[data-cgm-item="COLLECTIBLES"]');
  await page.waitForTimeout(500);
  const st1 = await page.evaluate(() => ({
    gs: window.__g.gameState,
    vis: getComputedStyle(document.getElementById('cgm-achievements')).display,
    tab: window.__g._colTab, flt: window.__g._colFilter,
  }));
  check('B01 COLLECTIBLES opens achievements state', st1.gs === 'achievements');
  check('B02 overlay visible', st1.vis === 'flex');
  check('B03 default tab CHARACTERS, filter ALL', st1.tab === 'characters' && st1.flt === 'all');

  const rail = await page.evaluate(() => Array.from(document.querySelectorAll('#ct-tabs .ct-tab')).map(t => ({
    tab: t.dataset.tab, label: t.textContent.trim(), active: t.classList.contains('active'),
  })));
  check('B04 nine tabs in the rail', rail.length === 9, JSON.stringify(rail.map(r => r.tab)));
  check('B05 rail order per spec', rail.map(r => r.tab).join(',') ===
    'characters,weapons,evolutions,fusions,relics,skins,achievements,lore,ost');
  check('B06 every tab shows an n/total counter', rail.every(r => /\d+\/\d+/.test(r.label)));

  // ── C. CHARACTERS tab — UI vs MetaProgress single source of truth ──
  const chars = await page.evaluate(() => {
    const g = window.__g;
    const cards = Array.from(document.querySelectorAll('#cx-characters .cx-card'));
    return {
      cards: cards.map((c, i) => ({
        i, locked: c.dataset.lk === '1',
        name: c.querySelector('.cx-name')?.textContent || '',
        req: c.querySelector('.cx-req')?.textContent || '',
        hasImg: !!c.querySelector('.cx-thumb img'),
      })),
      roster: g.characters.map(c => ({ id: c.id, name: c.name, unlocked: g.meta.isCharacterUnlocked(c.id) })),
    };
  });
  check('C01 one card per roster character', chars.cards.length === chars.roster.length,
    `${chars.cards.length} vs ${chars.roster.length}`);
  const lockMismatch = chars.roster.filter((r, i) => chars.cards[i] && (chars.cards[i].locked === r.unlocked));
  check('C02 every lock badge matches meta.isCharacterUnlocked', lockMismatch.length === 0,
    JSON.stringify(lockMismatch.map(m => m.id)));
  check('C03 all character cards use real portraits', chars.cards.every(c => c.hasImg));
  const lockedWithReq = chars.cards.filter(c => c.locked && /Clear (campaign stage \d+|the FINAL campaign stage)\./.test(c.req));
  check('C04 every locked character shows its true stage requirement',
    lockedWithReq.length === chars.cards.filter(c => c.locked).length,
    JSON.stringify(chars.cards.filter(c => c.locked && !/Clear/.test(c.req)).map(c => c.name)));
  await shot('01_characters_fresh.png');

  // Detail panel follows clicks
  const lockedIdx = chars.cards.find(c => c.locked)?.i;
  if (lockedIdx != null) {
    await page.click(`#cx-characters .cx-card[data-sidx="${lockedIdx}"]`);
    await page.waitForTimeout(150);
    const det = await page.evaluate(() => document.getElementById('ct-detail').textContent);
    check('C05 detail panel shows the clicked locked character + HOW TO UNLOCK',
      det.includes('HOW TO UNLOCK') && det.includes('Clear'), det.slice(0, 120));
  }

  // ── D. Filters ──
  await page.click('#ct-filters .ct-flt[data-flt="locked"]');
  await page.waitForTimeout(150);
  const fLocked = await page.evaluate(() => {
    const vis = Array.from(document.querySelectorAll('#cx-characters .cx-card')).filter(n => n.offsetParent !== null);
    return { n: vis.length, allLocked: vis.every(n => n.dataset.lk === '1') };
  });
  const expLocked = chars.roster.filter(r => !r.unlocked).length;
  check('D01 LOCKED filter shows exactly the locked set', fLocked.n === expLocked && fLocked.allLocked,
    `${fLocked.n} vs ${expLocked}`);
  await shot('02_characters_filter_locked.png');
  await page.click('#ct-filters .ct-flt[data-flt="unlocked"]');
  await page.waitForTimeout(150);
  const fUn = await page.evaluate(() => {
    const vis = Array.from(document.querySelectorAll('#cx-characters .cx-card')).filter(n => n.offsetParent !== null);
    return { n: vis.length, allUn: vis.every(n => n.dataset.lk === '0') };
  });
  check('D02 UNLOCKED filter shows exactly the unlocked set',
    fUn.n === chars.roster.length - expLocked && fUn.allUn, `${fUn.n}`);
  await page.click('#ct-filters .ct-flt[data-flt="all"]');
  await page.waitForTimeout(120);

  // ── E. WEAPONS / EVOLUTIONS / FUSIONS / RELICS — counts vs live catalogs ──
  const cat = await page.evaluate(async (build) => {
    const wc = await import(`./js/game/WeaponCatalog.js?v=20260720800000`);
    const be = await import(`./js/game/BuildEngine.js?v=20260902130000`);
    const fc = await import(`./js/game/FusionCatalog.js?v=20260902070000`);
    const mp = await import(`./js/game/MetaProgress.js?v=20260903020000`);
    const count = id => document.querySelectorAll(`#cx-${id} .cx-card`).length;
    return {
      uiW: count('weapons'), uiE: count('evolutions'), uiF: count('fusions'), uiR: count('relics'),
      expW: wc.getAllBaseWeapons().length +
            Object.values(be.WEAPON_DEFS).filter(d => d.category === 'weapon' && !d.external).length,
      expE: wc.EVOLUTION_RECIPES.length + Object.keys(be.EVOLUTION_RECIPES).length,
      expF: fc.FUSION_CARD_ORDER.length,
      expR: mp.RELIC_DEFS.length,
    };
  }, BUILD);
  check('E01 weapons count = legacy base + Build Engine arsenal', cat.uiW === cat.expW, `${cat.uiW} vs ${cat.expW}`);
  check('E02 evolutions count = legacy + Build Engine recipes', cat.uiE === cat.expE, `${cat.uiE} vs ${cat.expE}`);
  check('E03 fusions count = FUSION_CARD_ORDER', cat.uiF === cat.expF, `${cat.uiF} vs ${cat.expF}`);
  check('E04 relics count = RELIC_DEFS', cat.uiR === cat.expR, `${cat.uiR} vs ${cat.expR}`);

  for (const [tab, shotName] of [['weapons', '03_weapons.png'], ['evolutions', '04_evolutions.png'],
                             ['fusions', '05_fusions.png'], ['relics', '06_relics.png']]) {
    await page.evaluate(t => window.__g._colSetTab(t), tab);
    await page.waitForTimeout(200);
    await shot(shotName);
  }
  const fusionArt = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#cx-fusions .cx-card img')).length);
  check('E05 fusion cards show approved art', fusionArt > 0, String(fusionArt));

  // Every locked weapon/evolution/fusion names its requirement
  const reqAudit = await page.evaluate(() => {
    const bad = [];
    for (const tab of ['weapons', 'evolutions', 'fusions', 'relics']) {
      document.querySelectorAll(`#cx-${tab} .cx-card`).forEach(c => {
        const req = c.querySelector('.cx-req')?.textContent || '';
        if (c.dataset.lk === '1' && req.trim().length < 8) bad.push(tab + ':' + (c.querySelector('.cx-name')?.textContent || '?'));
      });
    }
    return bad;
  });
  check('E06 every locked card carries a real requirement text', reqAudit.length === 0, reqAudit.join(' | '));

  // ── F. SKINS / ACHIEVEMENTS / LORE / OST — legacy content preserved ──
  await page.evaluate(() => window.__g._colSetTab('skins'));
  await page.waitForTimeout(200);
  const skins = await page.evaluate(() => ({
    n: document.querySelectorAll('#sk-grid .sk-card').length,
    reqs: Array.from(document.querySelectorAll('#sk-grid .sk-req')).map(r => r.textContent),
    lockedN: document.querySelectorAll('#sk-grid .sk-thumb.locked').length,
  }));
  check('F01 secret-skins gallery preserved (5 visible skins)', skins.n === 5, String(skins.n));
  check('F02 every locked skin shows its honest unlock text', skins.reqs.length === skins.lockedN &&
    skins.reqs.every(t => /Win the Act 1 campaign|Survive 1[58]:00 in Endless/.test(t)),
    JSON.stringify(skins.reqs.slice(0, 2)));
  await shot('07_skins.png');

  await page.evaluate(() => window.__g._colSetTab('achievements'));
  await page.waitForTimeout(200);
  const achv = await page.evaluate(async () => {
    const mp = await import('./js/game/MetaProgress.js?v=20260903020000');
    return {
      caN: document.querySelectorAll('#ca-grid .ca-card').length,
      ceN: document.querySelectorAll('#ce-grid .ce-card').length,
      expCa: mp.ENDLESS_ACHIEVEMENTS.length,
      earnedBadge: document.getElementById('ca-earned')?.textContent,
      totalBadge: document.getElementById('ca-total')?.textContent,
    };
  });
  check('F03 achievements grid preserved', achv.caN === achv.expCa, `${achv.caN} vs ${achv.expCa}`);
  check('F04 Boss Echo Archive preserved (10 echoes)', achv.ceN === 10, String(achv.ceN));
  check('F05 header badge counts wired', achv.totalBadge === String(achv.expCa));
  await shot('08_achievements.png');

  await page.evaluate(() => window.__g._colSetTab('lore'));
  await page.waitForTimeout(200);
  const lore = await page.evaluate(() => ({
    em: document.querySelectorAll('#em-list .em-row').length,
    sl: document.querySelectorAll('#sl-list .sl-row').length,
    fltHidden: document.getElementById('ct-filters').classList.contains('hidden'),
  }));
  check('F06 lore tab: 5 milestones + 10 system logs', lore.em === 5 && lore.sl === 10, JSON.stringify(lore));
  check('F07 filters hidden on LORE (not filterable)', lore.fltHidden);
  await shot('09_lore.png');

  await page.evaluate(() => window.__g._colSetTab('ost'));
  await page.waitForTimeout(200);
  const ost = await page.evaluate(() => ({
    rows: document.querySelectorAll('#jb-list .jb-row').length,
    lockedRows: document.querySelectorAll('#jb-list .jb-row.locked').length,
  }));
  check('F08 OST jukebox preserved (8 tracks)', ost.rows === 8, String(ost.rows));
  await shot('10_ost.png');

  // ── G. Keyboard / controller path (synthetic Arrow keydowns = D-pad) ──
  await page.evaluate(() => window.__g._colSetTab('characters'));
  await page.waitForTimeout(150);
  await tap('ArrowDown');           // next tab
  const g1 = await page.evaluate(() => window.__g._colTab);
  check('G01 ArrowDown / D-pad down switches tab', g1 === 'weapons', g1);
  await tap('ArrowUp');
  const g2 = await page.evaluate(() => window.__g._colTab);
  check('G02 ArrowUp returns to CHARACTERS', g2 === 'characters', g2);
  const selBefore = await page.evaluate(() => window.__g._colSel[window.__g._colTab] ?? null);
  await tap('ArrowRight');
  const selAfter = await page.evaluate(() => ({
    sel: window.__g._colSel[window.__g._colTab],
    on: document.querySelectorAll('#cx-characters .ct-on').length,
  }));
  check('G03 ArrowRight moves the selection + highlight', selAfter.on === 1 && selAfter.sel !== selBefore,
    JSON.stringify({ selBefore, selAfter }));
  await tap('Enter');               // cycle filter
  const g3 = await page.evaluate(() => window.__g._colFilter);
  check('G04 ENTER / A cycles the filter', g3 === 'unlocked', g3);
  await tap('Enter');
  await tap('Enter');
  const g4 = await page.evaluate(() => window.__g._colFilter);
  check('G05 filter cycle wraps back to ALL', g4 === 'all', g4);

  // OST: ENTER plays / pauses the selected unlocked track (UI state only)
  await page.evaluate(() => { window.__g._colSetTab('ost'); window.__g.meta.recordEddieTime?.(2000); });
  await page.waitForTimeout(150);
  const ostPlayable = await page.evaluate(() => {
    window.__g._syncAchievementsOverlay();
    return document.querySelectorAll('#jb-list .jb-row[data-unlocked="1"]').length;
  });
  if (ostPlayable > 0) {
    await tap('Enter');
    const playing = await page.evaluate(() => document.querySelectorAll('#jb-list .jb-row.playing').length);
    check('G06 ENTER on OST toggles play on the selected track', playing === 1, String(playing));
    await tap('Enter');   // pause again (stop audio)
  } else {
    check('G06 ENTER on OST toggles play on the selected track', false, 'no unlockable track for the probe');
  }

  // ESC returns to the main menu
  await tap('Escape');
  await page.waitForTimeout(250);
  const esc = await page.evaluate(() => ({
    gs: window.__g.gameState,
    vis: getComputedStyle(document.getElementById('cgm-achievements')).display,
  }));
  check('G07 ESC / B returns to the main menu', esc.gs === 'start_menu' && esc.vis === 'none', JSON.stringify(esc));

  // ── H. ACTIVATE spend flow still works (display redesign must not break it) ──
  await page.evaluate(() => {
    const g = window.__g;
    g.meta.achievements.first_endless = true;
    g.meta.protocolFragments = 99; g.meta.credits = 99999;
  });
  await page.click('[data-cgm-item="COLLECTIBLES"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__g._colSetTab('achievements'));
  await page.waitForTimeout(200);
  const activateBtn = await page.$('#ca-grid .ca-activate');
  if (activateBtn) {
    await activateBtn.click();
    await page.waitForTimeout(300);
    const act = await page.evaluate(() => ({
      active: window.__g.meta.isCollectibleActive?.('first_endless') === true,
      label: document.querySelector('#ca-grid .ca-card .ca-status')?.textContent || '',
    }));
    check('H01 collectible ACTIVATE flow intact after redesign', act.active, JSON.stringify(act));
  } else {
    check('H01 collectible ACTIVATE flow intact after redesign', false, 'no ACTIVATE button rendered');
  }

  // ── I. Fully-unlocked seeded view + screenshots for Maria ──
  await page.evaluate(() => {
    const g = window.__g, m = g.meta;
    m.stagesCleared = m.totalStages;
    ['golden_skeleton_warrior', 'dark_cyber_arm_hero', 'grandmaster_dojang_girl', 'log_1997', 'log_1998']
      .forEach(k => m.unlock(k));
    Object.keys(m.achievements || {}).forEach(() => {});
    ['first_endless', 'endless_survivor', 'grid_legend', 'level_breaker', 'score_hunter', 'combo_master',
     'core_defender', 'endless_titan', 'score_legend', 'level_ascendant', 'combo_god', 'core_warden']
      .forEach(id => { m.achievements[id] = true; });
    ['cyberSerpent', 'cyberDragon', 'doubleDemon', 'titan', 'bloodfang', 'annihilator']
      .forEach(b => { m.bossKills[b] = true; });
    m.relics.eden_core_fragment = true; m.relics.null_battery = true;
    g._syncAchievementsOverlay();
  });
  await page.waitForTimeout(300);
  const seeded = await page.evaluate(() => {
    const railN = Array.from(document.querySelectorAll('#ct-tabs .ct-tab')).map(t => t.textContent.trim());
    const charCards = Array.from(document.querySelectorAll('#cx-characters .cx-card'));
    return { railN, charLocked: charCards.filter(c => c.dataset.lk === '1').length, charN: charCards.length };
  });
  check('I01 seeded save: all characters unlocked in UI', seeded.charLocked === 0,
    JSON.stringify(seeded));
  await page.evaluate(() => window.__g._colSetTab('characters'));
  await page.waitForTimeout(200);
  await shot('11_characters_unlocked.png');
  await page.evaluate(() => window.__g._colSetTab('skins'));
  await page.waitForTimeout(200);
  await shot('12_skins_unlocked.png');
  await page.evaluate(() => window.__g._colSetTab('achievements'));
  await page.waitForTimeout(200);
  await shot('13_achievements_unlocked.png');

  // ── J. Mobile viewport ──
  await page.setViewportSize({ width: 420, height: 800 });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__g._colSetTab('characters'));
  await page.waitForTimeout(200);
  const mob = await page.evaluate(() => ({
    detailHidden: getComputedStyle(document.getElementById('ct-detail')).display === 'none',
    cards: Array.from(document.querySelectorAll('#cx-characters .cx-card')).filter(n => n.offsetParent !== null).length,
  }));
  check('J01 mobile: detail aside hidden, cards still visible', mob.detailHidden && mob.cards > 0, JSON.stringify(mob));
  await shot('14_mobile_characters.png');

  // ── Final error sweep ──
  check('K01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  const gameErrors = consoleErrors.filter(t => !/audio\/music/.test(t));
  check('K02 zero game console errors across the whole session', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

  console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
  if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
  console.log('404s (info):', JSON.stringify([...new Set(notFound)].slice(0, 30)));
  await browser.close();
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
