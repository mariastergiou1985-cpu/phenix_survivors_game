import { Game } from './game/Game.js';
import { AudioManager } from './audio/AudioManager.js';

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

// Scale canvas to fill the window while preserving 16:9
function resizeCanvas() {
  const scaleX = window.innerWidth  / canvas.width;
  const scaleY = window.innerHeight / canvas.height;
  const scale  = Math.min(scaleX, scaleY);
  canvas.style.width  = `${canvas.width  * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

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

  // Upgrade card selection (1/2/3)
  if (game.upgradeUI) {
    const idx = { '1': 0, '2': 1, '3': 2 }[e.key];
    if (idx !== undefined) game.selectUpgrade(idx);
    return;
  }

  // One-shot abilities
  if (key === 'q') game.activateSonicPulse(mousePos);
  if (key === 'e') game.activateEMPCloud();
  if (key === 'm') game.audio?.toggleMute();

  // Restart after game over / victory
  if (key === 'r' && (game.gameOver || game.victory)) {
    if (game.audio) {
      // Keep audio manager but reset game state
    }
    game.reset();
  }

  // ESC — context-sensitive behaviour
  if (e.key === 'Escape') {
    if (game.gameState === 'character_select') {
      game.goToMainMenu();          // character select → back to start menu
    } else if (game.gameState === 'exit_screen') {
      game.goToMainMenu();          // exit screen → back to start menu
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
    // Start menu music if we're on a menu screen
    if (game.gameState === 'start_menu' || game.gameState === 'character_select') {
      game.audio.startMenuMusic();
    }
  }

  // Upgrade card click
  if (game.upgradeUI) {
    game.upgradeUI.handleClick(mousePos, game);
  }

  // ── Start Menu button clicks ──────────────────────────────────
  if (game.gameState === 'start_menu') {
    const BW = 360, BH = 52, startY = 280, spacing = 80;
    for (let i = 0; i < game.menuItems.length; i++) {
      const bx = canvas.width / 2 - BW / 2;
      const by = startY + i * spacing - 30;
      if (mousePos.x >= bx && mousePos.x <= bx + BW &&
          mousePos.y >= by && mousePos.y <= by + BH) {
        game.menuIndex = i;
        if (i === 0 || i === 1) game.goToCharacterSelect();
        else if (i === 2) { /* UPGRADES — placeholder, do nothing */ }
        else if (i === 3) { try { window.close(); } catch (e) {} game.goToExitScreen(); }
        break;
      }
    }
  }

  // ── Character Select clicks ───────────────────────────────────
  if (game.gameState === 'character_select') {
    const cardW = 220, cardH = 280, spacing = 280;
    const startX = canvas.width / 2 - cardW - spacing / 2;
    for (let i = 0; i < game.characters.length; i++) {
      const cx = startX + i * spacing;
      const cy = canvas.height / 2 - cardH / 2;
      if (mousePos.x >= cx && mousePos.x <= cx + cardW &&
          mousePos.y >= cy && mousePos.y <= cy + cardH) {
        if (game.characterIndex === i) {
          game.selectCharacter(game.characters[i].id);  // confirm on second click
        } else {
          game.characterIndex = i;                        // first click: select
        }
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

// ─── Game loop ────────────────────────────────────────────────────────────────
let lastTime = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);  // cap at 50ms
  lastTime = timestamp;

  game.setMousePos(mousePos);
  game.update(dt, { keys, mousePos, mouseDown });

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
