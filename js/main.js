import { Game } from './game/Game.js?v=145';
import { AudioManager } from './audio/AudioManager.js?v=14';

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

// Scale canvas to fill the window while preserving 16:9
function resizeCanvas() {
  const scaleX = window.innerWidth  / canvas.width;
  const scaleY = window.innerHeight / canvas.height;
  const scale  = Math.min(scaleX, scaleY);
  canvas.style.width  = `${Math.floor(canvas.width  * scale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
document.addEventListener('fullscreenchange', resizeCanvas);

// ─── Input state ──────────────────────────────────────────────────────────────
const keys    = new Set();
let mousePos  = { x: 0, y: 0 };
let mouseDown = false;

// ─── Game instance ────────────────────────────────────────────────────────────
const game = new Game();

// ─── Keyboard handling ────────────────────────────────────────────────────────
const SCROLL_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (SCROLL_KEYS.has(key)) e.preventDefault();

  keys.add(key);

  // Unlock audio on first keypress (browsers block autoplay until user gesture)
  if (!game.audio) {
    game.audio = new AudioManager();
    const hint = document.getElementById('click-to-start');
    if (hint) hint.style.display = 'none';
    if (game.gameState === 'playing') {
      game.audio.startGameplayMusic();
    } else if (game.gameState === 'start_menu' || game.gameState === 'character_select') {
      game.audio.startMenuMusic();
    }
  }

  // Upgrade card selection (1/2/3)
  if (game.upgradeUI) {
    const idx = { '1': 0, '2': 1, '3': 2 }[e.key];
    if (idx !== undefined) game.selectUpgrade(idx);
    return;
  }

  // One-shot abilities
  if (key === 'q') game.activatePulseShield();   // Pulse Shield (was Sonic Pulse)
  if (key === 'e') game.activateEMPCloud();   // EMP = stun only (no damage); Special unbound
  if (key === ' ') { game.activateThunderSolo(); game.activateOverheatedChains(); game.activateSpiritDojang(); }   // SPACE ultimate (per-character; each self-guards)
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

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  mouseDown = true;

  // Initialize Web Audio on first user gesture (browser requirement)
  if (!game.audio) {
    game.audio = new AudioManager();
    const hint = document.getElementById('click-to-start');
    if (hint) hint.style.display = 'none';
    // Start the right music for the current state
    if (game.gameState === 'playing') {
      game.audio.startGameplayMusic();
    } else if (game.gameState === 'start_menu' || game.gameState === 'character_select') {
      game.audio.startMenuMusic();
    }
  }

  // Each block is else-if so only ONE handler fires per click,
  // even if a handler changes game.gameState mid-event.

  if (game.upgradeUI) {
    // ── In-game upgrade card (level-up choice) ────────────────────
    game.upgradeUI.handleClick(mousePos, game);

  } else if (game.gameOver || game.victory) {
    // ── Game Over / Victory screen buttons ───────────────────────
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
    // Layout constants mirror Game.js _drawStartMenu (must stay in sync).
    const BW = 360, BH = 52, startY = 250, spacing = 64;
    for (let i = 0; i < game.menuItems.length; i++) {
      const bx = canvas.width / 2 - BW / 2;
      const by = startY + i * spacing - 30;
      if (mousePos.x >= bx && mousePos.x <= bx + BW &&
          mousePos.y >= by && mousePos.y <= by + BH) {
        game.menuIndex = i;
        if (i === 0 || i === 1) game.goToCharacterSelect();
        else if (i === 2) game.goToUpgradesScreen();
        else if (i === 3) game.goToInstructions();
        else if (i === 4) game.goToAudioSettings();
        else if (i === 5) game.goToCredits();
        else if (i === 6) { try { window.close(); } catch (e) {} game.goToExitScreen(); }
        break;
      }
    }

  } else if (game.gameState === 'upgrades') {
    // ── Upgrades screen ──────────────────────────────────────────
    game.handleUpgradesClick(mousePos);

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

  } else if (game.gameState === 'character_select') {
    // ── Character Select ─────────────────────────────────────────
    const cardW = 220, cardH = 280, spacing = 280;
    const startX = canvas.width / 2 - cardW - spacing / 2;
    for (let i = 0; i < game.characters.length; i++) {
      const cx = startX + i * spacing;
      const cy = canvas.height / 2 - cardH / 2;
      if (mousePos.x >= cx && mousePos.x <= cx + cardW &&
          mousePos.y >= cy && mousePos.y <= cy + cardH) {
        game.characterIndex = i;
        game.selectCharacter(game.characters[i].id);
        break;
      }
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
    && !game.paused && !game.gameOver && !game.victory && !game.upgradeUI;
  const want = inCombat ? 'none' : 'default';
  if (want !== _lastCursor) { canvas.style.cursor = want; _lastCursor = want; }
}

// ─── Game loop ────────────────────────────────────────────────────────────────
let lastTime = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);  // cap at 50ms
  lastTime = timestamp;

  game.setMousePos(mousePos);
  game.update(dt, { keys, mousePos, mouseDown });
  applyContextualCursor();

  // Apply screen shake offset
  const [ox, oy] = game.screenShake.getOffset();
  ctx.save();
  ctx.translate(ox, oy);
  game.draw(ctx);
  ctx.restore();

  requestAnimationFrame(loop);
}

// Kick off with two rAF calls so lastTime is initialized before the first real frame
requestAnimationFrame(ts => {
  lastTime = ts;
  requestAnimationFrame(loop);
});
