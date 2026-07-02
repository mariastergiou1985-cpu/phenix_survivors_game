import { Game } from './game/Game.js?v=20260701390000';
import { AudioManager } from './audio/AudioManager.js?v=20260701360000';
import { GamepadInput } from './Gamepad.js?v=20260701100000';
import { initTouchControls } from './TouchInput.js?v=20260701100000';

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

// Scale canvas to fill the window while preserving 16:9
function resizeCanvas() {
  // Use the VISUAL viewport when available — on mobile this is the actually-visible area
  // (excludes the browser address bar), so the menu/canvas fits the real landscape space.
  const vv = window.visualViewport;
  const vw = (vv && vv.width)  || window.innerWidth;
  const vh = (vv && vv.height) || window.innerHeight;
  const scale = Math.min(vw / canvas.width, vh / canvas.height);
  canvas.style.width  = `${Math.floor(canvas.width  * scale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => { resizeCanvas(); setTimeout(resizeCanvas, 250); });
window.visualViewport?.addEventListener('resize', resizeCanvas);
document.addEventListener('fullscreenchange', () => { resizeCanvas(); [100, 300, 750].forEach(ms => setTimeout(resizeCanvas, ms)); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);
// Mobile reports its final viewport only after the address bar settles — re-fit shortly after load.
window.addEventListener('load', () => {
  setTimeout(resizeCanvas, 300);
  setTimeout(resizeCanvas, 750);
  setTimeout(resizeCanvas, 1500);
});

// ─── Input state ──────────────────────────────────────────────────────────────
const keys    = new Set();
let mousePos  = { x: 0, y: 0 };
let mouseDown = false;

// ─── Game instance ────────────────────────────────────────────────────────────
const game = new Game();
console.log('BUILD 20260616080000 cgm-overlay active');

// ─── Keyboard handling ────────────────────────────────────────────────────────
const SCROLL_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (SCROLL_KEYS.has(key)) e.preventDefault();

  keys.add(key);
  // (Audio init handled by _initAudioOnGesture on document — covers overlay clicks too)

  // Forced mutation card selection (1/2/3 only — NO skip, NO reroll; ESC cannot close it)
  // ArrowLeft/ArrowRight move the controller cursor; Enter confirms it (dispatched by gamepad A/Cross).
  if (game.mutationUI) {
    const midx = { '1': 0, '2': 1, '3': 2 }[e.key];
    if (midx !== undefined) {
      game.mutationUI.selectedIndex = midx;
      game.selectMutation(midx);
    } else if (e.key === 'ArrowLeft') {
      const n = game.mutationUI.choices.length;
      game.mutationUI.selectedIndex = (game.mutationUI.selectedIndex - 1 + n) % n;
    } else if (e.key === 'ArrowRight') {
      const n = game.mutationUI.choices.length;
      game.mutationUI.selectedIndex = (game.mutationUI.selectedIndex + 1) % n;
    } else if (e.key === 'Enter') {
      game.selectMutation(game.mutationUI.selectedIndex);
    }
    return;
  }

  // Upgrade card selection (1/2/3) + reroll (R)
  // ArrowLeft/ArrowRight move the controller cursor; Enter confirms it (dispatched by gamepad A/Cross).
  if (game.upgradeUI) {
    const idx = { '1': 0, '2': 1, '3': 2 }[e.key];
    if (idx !== undefined) {
      game.upgradeUI.selectedIndex = idx;
      game.selectUpgrade(idx);
    } else if (key === 'r') {
      game.rerollUpgrade();
    } else if (e.key === 'ArrowLeft') {
      const n = game.upgradeUI.choices.length;
      game.upgradeUI.selectedIndex = (game.upgradeUI.selectedIndex - 1 + n) % n;
    } else if (e.key === 'ArrowRight') {
      const n = game.upgradeUI.choices.length;
      game.upgradeUI.selectedIndex = (game.upgradeUI.selectedIndex + 1) % n;
    } else if (e.key === 'Enter') {
      game.selectUpgrade(game.upgradeUI.selectedIndex);
    }
    return;
  }

  // ── End-screen controller navigation (ArrowLeft/Right cycle buttons, Enter confirms) ──
  if (game.gameOver && !game.upgradeUI) {
    if (e.key === 'ArrowLeft') {
      game._endScreenBtnIndex = ((game._endScreenBtnIndex ?? 0) - 1 + 3) % 3;
      return;
    }
    if (e.key === 'ArrowRight') {
      game._endScreenBtnIndex = ((game._endScreenBtnIndex ?? 0) + 1) % 3;
      return;
    }
    if (e.key === 'Enter') {
      const idx = game._endScreenBtnIndex ?? 0;
      if (idx === 0) { game.reset(); game.audio?.startGameplayMusic(); }
      else if (idx === 1) { game.audio?.startMenuMusic(); game.goToUpgradesScreen(); }
      else { game.goToMainMenu(); }
      return;
    }
  }
  if (game.victory && !game.upgradeUI) {
    if (e.key === 'ArrowLeft') {
      game._endScreenBtnIndex = ((game._endScreenBtnIndex ?? 0) - 1 + 2) % 2;
      return;
    }
    if (e.key === 'ArrowRight') {
      game._endScreenBtnIndex = ((game._endScreenBtnIndex ?? 0) + 1) % 2;
      return;
    }
    if (e.key === 'Enter') {
      const idx = game._endScreenBtnIndex ?? 0;
      if (idx === 0) { game.goToMainMenu(); }
      else { game.continueEndless(); }
      return;
    }
  }

  // One-shot abilities
  if (key === 'q') game.activatePulseShield();   // Pulse Shield — shared by ALL characters
  if (key === 'e') game.activateEMPCloud();       // EMP stun — shared by ALL (Phasewalker layers his Shockwave VFX inside)
  if (key === ' ') { game.activateThunderSolo(); game.activateOverheatedChains(); game.activateCyberBikeRush(); game.activateSkyfallLances(); game.activateChromePhantomProtocol(); game.activateDigitalSingularity(); game.activateEuclidPlague(); game.activateProtocol0Cataclysm(); }   // SPACE ultimate (per-character; each self-guards)
  if (key === 'm') game.audio?.toggleMute();
  if (key === 'f') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
  if (key === 't' && game.gameState === 'playing' && !game.gameOver && !game.victory) {
    game.aimAssist = !game.aimAssist;
  }
  // Restart after game over / victory
  if (key === 'r' && (game.gameOver || game.victory)) {
    game.reset();
    game.audio?.startGameplayMusic();
  }

  // ESC — context-sensitive behaviour
  if (e.key === 'Escape') {
    if (game.gameState === 'character_select') {
      game.goToMainMenu();          // character select → back to start menu
    } else if (game.gameState === 'exit_screen') {
      game.goToMainMenu();          // exit screen → back to start menu
    } else if (game.gameState === 'credits') {
      game.goToMainMenu();
    } else if (game.gameState === 'instructions') {
      game.goToMainMenu();
    } else if (game.gameState === 'achievements') {
      game.goToMainMenu();
    } else if (game.gameState === 'playing') {
      if (game.gameOver || game.victory) {
        game.goToMainMenu();        // game ended → back to start menu
      } else {
        game.paused = !game.paused; // mid-game → toggle pause
      }
    }
    // start_menu: ESC does nothing (no crash)
    // upgrades: handled via keydown in game update
  }
});

window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
});

// ─── Mouse handling ───────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  mousePos = {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
});

// ─── Web Audio init on FIRST user gesture anywhere (overlay OR canvas) ───────
function _initAudioOnGesture() {
  if (game.audio) return;
  game.audio = new AudioManager();
  const hint = document.getElementById('click-to-start');
  if (hint) hint.style.display = 'none';
  if (game.gameState === 'playing') {
    game.audio.startGameplayMusic();
  } else if (game.gameState === 'start_menu' || game.gameState === 'character_select') {
    game.audio.startMenuMusic();
  }
}
document.addEventListener('mousedown', _initAudioOnGesture, { once: true });
document.addEventListener('keydown',   _initAudioOnGesture, { once: true });
document.addEventListener('touchstart',_initAudioOnGesture, { once: true });

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  mouseDown = true;

  // Each block is else-if so only ONE handler fires per click,
  // even if a handler changes game.gameState mid-event.

  if (game.mutationUI) {
    // ── Forced mutation card (Endless) — click selects; no skip/reroll ─
    game.mutationUI.handleClick(mousePos, game);

  } else if (game.upgradeUI) {
    // ── In-game upgrade card (level-up choice) ────────────────────
    game.upgradeUI.handleClick(mousePos, game);

  } else if (game._postArenaChoice && game._pacMsgStep >= 5) {
    // ── Post-Arena NULL decision panel — click on option cards ───
    // Panel: PW=560,PH=390,PX=(1280-560)/2=360,PY=(720-390)/2=165
    // Options OW=480,OH=46,OX=360+(560-480)/2=400, start oy=PY+200=365
    const _pac_OW = 480, _pac_OH = 46, _pac_OX = 400;
    let _pac_oy = 365;
    for (let _pi = 0; _pi < 3; _pi++) {
      if (mousePos.x >= _pac_OX && mousePos.x <= _pac_OX + _pac_OW &&
          mousePos.y >= _pac_oy  && mousePos.y <= _pac_oy + _pac_OH) {
        game._selectPostArenaChoice(_pi);
        break;
      }
      _pac_oy += _pac_OH + 8;
    }

  } else if (game.victory) {
    // ── Victory screen — two buttons ─────────────────────────────
    // Rects kept in sync with Game._drawVictoryScreen (BW=300, BH=50, BY=540).
    // RETURN TO MAIN MENU (x 328–628) • CONTINUE — ENDLESS (x 652–952).
    if (mousePos.y >= 540 && mousePos.y <= 590) {
      if (mousePos.x >= 328 && mousePos.x <= 628) {
        game.goToMainMenu();
      } else if (mousePos.x >= 652 && mousePos.x <= 952) {
        game.continueEndless();
      }
    }

  } else if (game.gameOver) {
    // ── Game Over screen buttons ─────────────────────────────────
    // RETRY  (x 316–516, y 440–486)
    if (mousePos.x >= 316 && mousePos.x <= 516 &&
        mousePos.y >= 440 && mousePos.y <= 486) {
      game.reset();
      game.audio?.startGameplayMusic();
    // UPGRADES  (x 540–740, y 440–486)
    } else if (mousePos.x >= 540 && mousePos.x <= 740 &&
               mousePos.y >= 440 && mousePos.y <= 486) {
      game.audio?.startMenuMusic();
      game.goToUpgradesScreen();
    // MAIN MENU  (x 764–964, y 440–486)
    } else if (mousePos.x >= 764 && mousePos.x <= 964 &&
               mousePos.y >= 440 && mousePos.y <= 486) {
      game.goToMainMenu();
    }

  } else if (game.gameState === 'start_menu') {
    // ── Start Menu ───────────────────────────────────────────────
    // Top-right gear icon → shortcut to the SAME Settings screen (no duplicate logic).
    const gr = game._menuGearRect();
    if (mousePos.x >= gr.x && mousePos.x <= gr.x + gr.w &&
        mousePos.y >= gr.y && mousePos.y <= gr.y + gr.h) {
      game.goToSettings();
    } else {
      // Hit-test the baked central button slots via the shared Game._menuButtonRect geometry.
      for (let i = 0; i < game.menuItems.length; i++) {
        const r = game._menuButtonRect(i);
        if (mousePos.x >= r.x && mousePos.x <= r.x + r.w &&
            mousePos.y >= r.y && mousePos.y <= r.y + r.h) {
          game.menuIndex = i;
          game._selectMenuItem(game.menuItems[i]);
          break;
        }
      }
    }

  } else if (game.gameState === 'settings') {
    // ── Settings sub-menu — buttons use Game._settingsButtonRect (shared geometry) ─
    for (let i = 0; i < game.settingsItems.length; i++) {
      const r = game._settingsButtonRect(i);
      if (mousePos.x >= r.x && mousePos.x <= r.x + r.w &&
          mousePos.y >= r.y && mousePos.y <= r.y + r.h) {
        game._settingsIndex = i;
        game._selectSettingsItem(game.settingsItems[i]);
        break;
      }
    }

  } else if (game.gameState === 'upgrades') {
    // ── Upgrades screen ──────────────────────────────────────────
    game.handleUpgradesClick(mousePos);

  } else if (game.gameState === 'achievements') {
    // ── Achievements screen (display only) ───────────────────────
    game.handleAchievementsClick(mousePos);

  } else if (game.gameState === 'credits') {
    const ph = 460, bw = 220, bh = 46;
    const py = canvas.height / 2 - ph / 2 - 10;
    const bx = canvas.width  / 2 - bw / 2;
    const by = py + ph - 60;
    if (mousePos.x >= bx && mousePos.x <= bx + bw &&
        mousePos.y >= by && mousePos.y <= by + bh) {
      game.goToMainMenu();
    }

  } else if (game.gameState === 'instructions') {
    // BACK button: bw=160,bh=40 centered, by=py+ph-52 where pw=1140,ph=580,py=70
    const bw = 160, bh = 40;
    const bx = Math.round(canvas.width / 2 - bw / 2);
    const by = Math.round((canvas.height - 580) / 2) + 580 - 52;
    if (mousePos.x >= bx && mousePos.x <= bx + bw &&
        mousePos.y >= by && mousePos.y <= by + bh) {
      game.goToMainMenu();
    }

  } else if (game.gameState === 'lore_archive') {
    // Left nav section click — navX=50+16=66, navY=55+66=121, navW=206, sH=floor(490/7)=70
    const navX = 66, navY = 121, navW = 206, navH = 490;
    const SECTION_COUNT = 7;
    const sH = Math.floor(navH / SECTION_COUNT);
    for (let i = 0; i < SECTION_COUNT; i++) {
      const sy = navY + i * sH;
      if (mousePos.x >= navX && mousePos.x <= navX + navW &&
          mousePos.y >= sy   && mousePos.y <= sy + sH) {
        game._loreSection = i;
        break;
      }
    }
    // BACK button: bw=160,bh=38 centered, by=py+ph-48 where ph=610,py=55
    const bw = 160, bh = 38;
    const bx = Math.round(canvas.width / 2 - bw / 2);
    const by = Math.round((canvas.height - 610) / 2) + 610 - 48;
    if (mousePos.x >= bx && mousePos.x <= bx + bw &&
        mousePos.y >= by && mousePos.y <= by + bh) {
      game.goToSettings();
    }

  } else if (game.gameState === 'character_select') {
    // ── Character Select ─────────────────────────────────────────
    // Outfit toggle buttons first (top-centre) — equip a cosmetic outfit for the
    // highlighted character WITHOUT starting the run. Locked secret is a no-op.
    const ob   = game._outfitBtnRects();
    const ocid = game.characters[game.characterIndex].id;
    const pfBtn = game._pfUnlockBtnRect();
    const act = game._charSelectActionRects();
    if (pfBtn && game._inRect(mousePos, pfBtn)) {
      game.tryUnlockSelectedCharacterPF();          // spend Protocol Fragments to unlock the highlighted char
    } else if (game._inRect(mousePos, ob.defaultRect)) {
      game.meta.setSelectedOutfit(ocid, 'default');
    } else if (game._inRect(mousePos, ob.secretRect)) {
      game.meta.setSelectedOutfit(ocid, 'secret');
    } else if (game._inRect(mousePos, act.back)) {
      game.goToMainMenu();                              // BACK — preserves selected character
    } else if (game._inRect(mousePos, act.start)) {
      game.selectCharacter(game.characters[game.characterIndex].id);   // START GAME (Act 1); self-guards locked
    } else if (game._inRect(mousePos, act.endless)) {
      game.startSelectedEndless();                      // START ENDLESS (guards: char + Endless unlocked)
    } else {
      // Hit-test the SAME 2-row grid the screen draws (Game._charCardLayout) — always in sync.
      const lay = game._charCardLayout();
      for (let i = 0; i < lay.cards.length; i++) {
        const r = lay.cards[i];
        if (mousePos.x >= r.x && mousePos.x <= r.x + r.w &&
            mousePos.y >= r.y && mousePos.y <= r.y + r.h) {
          game.previewCharacter(i);                     // highlight + preview only (no auto-start)
          break;
        }
      }
    }

  } else if (game.gameState === 'playing' && game.paused && !game.gameOver && !game.victory) {
    // ── Pause menu — RESUME / RETURN TO MAIN MENU ──
    if (game._inRect(mousePos, game._pauseButtonRect(0))) {
      game.paused = false;
    } else if (game._inRect(mousePos, game._pauseButtonRect(1))) {
      game.goToMainMenu();                              // clean abandon: gameState leaves 'playing', menu music resumes
    }
  }
});

canvas.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
});

// Prevent context menu on right-click over canvas
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ─── Contextual cursor ────────────────────────────────────────────────────────
// Hide the OS cursor during active combat (shooting is automatic); show it for any
// screen where the player must click/select — menus, pause, end-screen, upgrade cards.
let _lastCursor = '';
function applyContextualCursor() {
  const inCombat = game.gameState === 'playing'
    && !game.paused && !game.gameOver && !game.victory && !game.upgradeUI && !game.mutationUI
    && !game._postArenaChoice;
  const want = inCombat ? 'none' : 'default';
  if (want !== _lastCursor) { canvas.style.cursor = want; _lastCursor = want; }
}

// ─── Controller support (Gamepad API) ──────────────────────────────────────────
// Maps a connected controller onto the EXISTING keyboard paths: held keys are injected into the
// `keys` Set (movement/dash, read by game.update); one-shot actions are dispatched as synthetic
// keydown events so the real keydown handler runs (abilities, ESC/pause, menu select, cards). This
// keeps all game logic unchanged and leaves keyboard/mouse fully working when no pad is present.
const pad         = new GamepadInput();
const padHeld     = new Set();   // keys this controller is currently injecting (so we only clear ours)
const padTapUp    = [];          // synthetic keydowns to release next frame (one press = one action)
const prevDir     = { up: false, down: false, left: false, right: false };

function padSetHeld(key, on) {
  if (on) { if (!padHeld.has(key)) { keys.add(key);    padHeld.add(key); } }
  else    { if (padHeld.has(key)) { keys.delete(key); padHeld.delete(key); } }
}
function padClearHeld() { for (const k of padHeld) keys.delete(k); padHeld.clear(); }
function padTap(key) { window.dispatchEvent(new KeyboardEvent('keydown', { key })); padTapUp.push(key); }
function padDirEdge(name, now) { const was = prevDir[name]; prevDir[name] = now; return now && !was; }

function applyGamepad() {
  // Release last frame's taps so a held button still fires only once.
  for (const k of padTapUp) window.dispatchEvent(new KeyboardEvent('keyup', { key: k }));
  padTapUp.length = 0;

  const s = pad.poll();
  game._controllerConnected = pad.connected;
  game._controllerType      = pad.type;
  game._controllerActivated = pad.activated;
  if (!s || !s.activated) { padClearHeld(); prevDir.up = prevDir.down = prevDir.left = prevDir.right = false; return; }

  const up = s.axes.ly < 0 || s.btn.up.held, down = s.axes.ly > 0 || s.btn.down.held;
  const left = s.axes.lx < 0 || s.btn.left.held, right = s.axes.lx > 0 || s.btn.right.held;
  const eUp = padDirEdge('up', up), eDown = padDirEdge('down', down);
  const eLeft = padDirEdge('left', left), eRight = padDirEdge('right', right);

  const inGameplay = game.gameState === 'playing' && !game.paused && !game.gameOver &&
                     !game.victory && !game.upgradeUI && !game.mutationUI;
  const cardUI = game.upgradeUI || game.mutationUI;

  if (inGameplay) {
    padSetHeld('w', up); padSetHeld('s', down); padSetHeld('a', left); padSetHeld('d', right);
    padSetHeld('shift', s.btn.rt.held || s.btn.lt.held || s.btn.b.held);   // RT/R2 / LT/L2 / B/Circle = dash
    if (s.btn.lb.pressed)    padTap('q');        // LB / L1 → Pulse Shield
    if (s.btn.rb.pressed)    padTap('e');        // RB / R1 → EMP
    if (s.btn.y.pressed)     padTap(' ');        // Y / Triangle → Ultimate
    if (s.btn.start.pressed) padTap('Escape');   // Start/Options → pause (B/Circle is now gameplay dash)
  } else {
    padClearHeld();                              // no held movement outside gameplay
    if (eUp)    padTap('ArrowUp');
    if (eDown)  padTap('ArrowDown');
    if (eLeft)  padTap('ArrowLeft');
    if (eRight) padTap('ArrowRight');
    if (cardUI) {                                // forced/level-up card screens
      // A/Cross confirms the cursor-highlighted card (cursor starts at 0 = card 1, same as before).
      // X/Square and Y/Triangle remain direct shortcuts for cards 2 and 3.
      // Left/Right (D-pad + analog) move the cursor via the ArrowLeft/ArrowRight events already
      // dispatched above; the keydown handler updates selectedIndex and the draw method highlights it.
      if (s.btn.a.pressed) padTap('Enter');    // confirm cursor
      if (s.btn.x.pressed) padTap('2');
      if (s.btn.y.pressed) padTap('3');
      if (s.btn.b.pressed) padTap('r');
    } else {
      if (s.btn.a.pressed)     padTap('Enter');  // A / Cross → confirm/select
      if (s.btn.b.pressed)     padTap('Escape'); // B / Circle → back
      if (s.btn.start.pressed) padTap('Escape'); // Start/Options → back/menu
    }
  }
}

// ─── Mobile touch controls ──────────────────────────────────────────────────
// Touch-device-gated (no-op on desktop). Injects into the SAME `keys` Set + synthetic
// KeyboardEvents as the gamepad bridge; canvas taps update mousePos then drive the
// existing mousedown hit-testing. setAim mirrors the mousemove scaling.
initTouchControls({
  canvas,
  keys,
  game,
  setAim: (x, y) => { mousePos = { x, y }; game.setMousePos(mousePos); },
  onQ:   () => game.activatePulseShield(),
  onE:   () => game.activateEMPCloud(),
  onUlt: () => { game.activateThunderSolo(); game.activateOverheatedChains(); game.activateCyberBikeRush(); game.activateSkyfallLances(); game.activateChromePhantomProtocol(); game.activateDigitalSingularity(); game.activateEuclidPlague(); game.activateProtocol0Cataclysm(); },
});

// ─── Game loop ────────────────────────────────────────────────────────────────
let lastTime = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);  // cap at 50ms
  lastTime = timestamp;

  // Crash-resilient: a single transient error in update/draw must NOT stop the rAF loop
  // (that was a hard-freeze with the timer stuck). We always reschedule, keep the canvas
  // save-stack balanced via finally, and log the first error so the cause stays visible.
  const _fStart = performance.now();
  try {
    applyGamepad();   // inject controller input into keys/handlers before the update reads them
    game.setMousePos(mousePos);
    game.update(dt, { keys, mousePos, mouseDown });
    applyContextualCursor();

    // Apply screen shake offset
    const [ox, oy] = game.screenShake.getOffset();
    ctx.save();
    try { ctx.translate(ox, oy); game.draw(ctx); }
    finally { ctx.restore(); }
  } catch (err) {
    if (!loop._errLogged) { console.error('[game loop]', err); loop._errLogged = true; }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
