// ─── Mobile touch controls ──────────────────────────────────────────────────
// Phase 1 mobile support. Touch-device-gated; on desktop this module does NOTHING
// (no overlay, no listeners) so keyboard + controller behave exactly as before.
//
// Like the Gamepad bridge, touch input is injected into the SAME existing paths:
//   • joystick  → held movement keys added/removed in the shared `keys` Set (w/a/s/d)
//   • Dash      → held 'shift' in the `keys` Set
//   • Q/E/ULT   → synthetic `KeyboardEvent` keydown/keyup on window (real handler runs)
//   • Pause     → synthetic 'Escape' keydown
//   • menu taps → update mousePos (same getBoundingClientRect scaling as mousemove),
//                 then dispatch a real mousedown/mouseup on the canvas so the existing
//                 hit-testing runs unchanged (menus, character select, cards, end screens).
// No separate mobile gameplay logic; nothing here changes balance or desktop behaviour.

function isTouchDevice() {
  return ('ontouchstart' in window)
      || (navigator.maxTouchPoints > 0)
      || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

export function initTouchControls({ canvas, keys, game, setAim, onQ, onE, onUlt }) {
  if (!isTouchDevice()) return null;   // desktop: do nothing at all

  // ── styles ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    html, body { touch-action: none; overscroll-behavior: none; }
    /* Lock the page to the visible viewport (touch only) so in-app/mobile browsers don't
       add scroll/bounce margins around the centred canvas. Desktop is never touched. */
    body { position: fixed; inset: 0; }
    #touch-overlay { position: fixed; inset: 0; z-index: 50; pointer-events: none;
      touch-action: none; -webkit-user-select: none; user-select: none; }
    #touch-overlay .tc { pointer-events: auto; touch-action: none;
      -webkit-tap-highlight-color: transparent; }
    #touch-joy { position: absolute; left: 4%; bottom: 8%; width: 90px; height: 90px;
      border-radius: 50%; background: rgba(120,160,200,0.08);
      border: 1.5px solid rgba(150,200,255,0.28); }
    #touch-joy-knob { position: absolute; left: 50%; top: 50%; width: 36px; height: 36px;
      margin: -18px 0 0 -18px; border-radius: 50%;
      background: rgba(150,210,255,0.25); border: 1.5px solid rgba(180,230,255,0.55);
      box-shadow: 0 0 10px rgba(120,200,255,0.4); }
    #touch-btns { position: absolute; right: 3%; bottom: 7%; width: 160px; height: 118px; }
    #touch-btns button, #touch-pause, #touch-fs { position: absolute; border-radius: 10px;
      font: bold 11px Consolas, monospace; color: #cfefff; letter-spacing: 1px;
      background: linear-gradient(180deg, rgba(10,26,44,0.92), rgba(4,10,20,0.92));
      border: 1.5px solid rgba(46,230,246,0.65);
      box-shadow: 0 0 12px rgba(46,230,246,0.35), inset 0 1px 0 rgba(255,255,255,0.10),
                  inset 0 -6px 12px rgba(46,230,246,0.06);
      text-shadow: 0 0 6px rgba(46,230,246,0.8); cursor: pointer; }
    #touch-btns button:active, #touch-pause:active, #touch-fs:active {
      background: linear-gradient(180deg, rgba(46,230,246,0.30), rgba(10,26,44,0.9));
      box-shadow: 0 0 18px rgba(46,230,246,0.7); }
    #touch-btns button { width: 50px; height: 50px; }
    #btn-ult   { right: 0; bottom: 60px; width: 55px; height: 55px; color: #ffd9a8;
      border-color: rgba(255,140,60,0.75); font-size: 12px;
      text-shadow: 0 0 6px rgba(255,140,60,0.9);
      box-shadow: 0 0 14px rgba(255,140,60,0.45), inset 0 1px 0 rgba(255,255,255,0.10); }
    #btn-dash  { right: 62px; bottom: 56px; color: #bfe9ff; }
    #btn-q     { right: 62px; bottom: 2px; }
    #btn-e     { right: 4px;  bottom: 2px; }
    #touch-pause { top: 12px; right: 12px; width: 40px; height: 40px; font-size: 15px; border-radius: 7px; }
    #touch-fs { top: 12px; left: 12px; width: 40px; height: 40px; font-size: 17px; border-radius: 7px; }
    #touch-rotate { position: fixed; inset: 0; z-index: 60; pointer-events: none;
      display: none; align-items: center; justify-content: center; text-align: center;
      background: rgba(5,8,15,0.82); color: #8fd0ff; font: bold 22px Consolas, monospace;
      letter-spacing: 1px; }
    #touch-rotate span { padding: 0 24px; text-shadow: 0 0 12px rgba(80,180,255,0.6); }
  `;
  document.head.appendChild(style);

  // ── overlay DOM ─────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'touch-overlay';
  overlay.innerHTML = `
    <div id="touch-joy" class="tc"><div id="touch-joy-knob"></div></div>
    <div id="touch-btns" class="tc">
      <button id="btn-ult"  data-hold="0" data-key=" ">ULT</button>
      <button id="btn-dash" data-hold="1" data-key="shift">DASH</button>
      <button id="btn-q"    data-hold="0" data-key="q">Q</button>
      <button id="btn-e"    data-hold="0" data-key="e">E</button>
    </div>
    <button id="touch-pause" class="tc" data-hold="0" data-key="Escape">⏸</button>
    <button id="touch-fs" class="tc" title="Fullscreen">⛶</button>`;
  document.body.appendChild(overlay);

  const rotate = document.createElement('div');
  rotate.id = 'touch-rotate';
  rotate.innerHTML = '<span>⟳ Rotate your device to LANDSCAPE for the best experience</span>';
  document.body.appendChild(rotate);

  const joy    = overlay.querySelector('#touch-joy');
  const knob   = overlay.querySelector('#touch-joy-knob');
  const btns   = overlay.querySelector('#touch-btns');
  const pauseB = overlay.querySelector('#touch-pause');
  const fsBtn  = overlay.querySelector('#touch-fs');

  // ── Fullscreen helper (Android Chrome etc.) — user-initiated, non-spammy. Hidden where the
  // Fullscreen API is unavailable (e.g. iOS Safari / some in-app browsers). Going fullscreen
  // hides browser chrome so the canvas gets the whole screen; resizeCanvas() refits on the
  // fullscreenchange event already wired in main.js. Desktop keeps its existing F-key toggle.
  const fsRoot = document.documentElement;
  if (!fsRoot.requestFullscreen) {
    fsBtn.style.display = 'none';
  } else {
    fsBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      try {
        const r = document.fullscreenElement ? document.exitFullscreen() : fsRoot.requestFullscreen();
        if (r && r.catch) r.catch(() => {});
        // Re-fit canvas after browser chrome animates away (covers slow Android renderers)
        [100, 300, 750].forEach(ms => setTimeout(() => window.dispatchEvent(new Event('resize')), ms));
      } catch (_) {}
    });
  }

  // ── helpers: inject into the same input the keyboard/controller use ───────
  const heldMove = new Set();   // movement/dash keys WE injected (clear only ours)
  function setKey(k, on) {
    if (on) { if (!heldMove.has(k)) { keys.add(k);    heldMove.add(k); } }
    else    { if (heldMove.has(k)) { keys.delete(k); heldMove.delete(k); } }
  }
  function clearHeld() { for (const k of heldMove) keys.delete(k); heldMove.clear(); }
  function tapKey(key) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    window.dispatchEvent(new KeyboardEvent('keyup',   { key }));
  }

  // ── virtual joystick → w/a/s/d held ───────────────────────────────────────
  // Pointer Events + setPointerCapture: on real mobile this guarantees the joystick keeps
  // receiving move events even when the finger leaves the pad, and (with touch-action:none)
  // stops the browser from hijacking the drag as a scroll/refresh gesture — the actual cause
  // of "joystick does not move the character" on hardware (plain touch events get stolen).
  const DEAD = 8, MAXR = 30;   // smaller deadzone → better diagonal feel; MAXR matched to 90px joy
  let joyPid = null;
  function joyCenter() { const r = joy.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function joyMove(pt) {
    const c = joyCenter();
    let dx = pt.clientX - c.x, dy = pt.clientY - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > MAXR) { dx *= MAXR / dist; dy *= MAXR / dist; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    setKey('w', dy < -DEAD); setKey('s', dy > DEAD);
    setKey('a', dx < -DEAD); setKey('d', dx > DEAD);
  }
  function joyReset() {
    joyPid = null; knob.style.transform = '';
    setKey('w', false); setKey('s', false); setKey('a', false); setKey('d', false);
  }
  joy.addEventListener('pointerdown', e => {
    if (joyPid !== null) return;
    joyPid = e.pointerId;
    try { joy.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    joyMove(e);
  });
  joy.addEventListener('pointermove', e => {
    if (e.pointerId !== joyPid) return;
    e.preventDefault();
    joyMove(e);
  });
  const joyUp = e => {
    if (e.pointerId !== joyPid) return;
    try { joy.releasePointerCapture(e.pointerId); } catch (_) {}
    joyReset();
  };
  joy.addEventListener('pointerup', joyUp);
  joy.addEventListener('pointercancel', joyUp);

  // Backgrounding the tab (call, notification, app switch) does not always deliver
  // pointercancel, so the joystick could stay latched and keep the hero walking on return.
  // Mirrors the keyboard blur guard in main.js; clears only the keys WE injected.
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearHeld(); joyReset(); } });
  window.addEventListener('blur', () => { clearHeld(); joyReset(); });

  // ── action buttons (Dash held; Q/E/ULT direct callbacks; Pause one-shot) ─
  function bindButton(el, cb) {
    const key = el.dataset.key, hold = el.dataset.hold === '1';
    el.addEventListener('pointerdown', e => {
      e.preventDefault();                       // no 300ms delay / no synthetic mouse
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      if (hold)    setKey(key, true);           // Dash → held 'shift' in keys Set
      else if (cb) cb();                        // Q/E/ULT → direct action (avoids synthetic event quirks on mobile)
      else         tapKey(key);                 // Pause → synthetic 'Escape' keydown+keyup
    });
    if (hold) {
      const up = e => { e.preventDefault(); setKey(key, false); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }
  const _btnCbs = { q: onQ || null, e: onE || null, ' ': onUlt || null };
  btns.querySelectorAll('button').forEach(el => bindButton(el, _btnCbs[el.dataset.key] || null));
  bindButton(pauseB);

  // ── canvas taps → existing mousedown hit-testing (menus / cards / screens) ─
  function toCanvas(touch) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    return { x: (touch.clientX - r.left) * sx, y: (touch.clientY - r.top) * sy };
  }
  // Listen at document level (not on the canvas): a touch on the canvas passes through the
  // pointer-events:none overlay, and document reliably receives it across browsers. Touches
  // that start on our controls are ignored here (they handle themselves).
  // '#cgm-charselect' is the DOM character-select overlay — taps inside it must fire native
  // click events (card select / start buttons). Intercepting them with preventDefault here
  // cancelled those clicks on mobile; treating it like a control zone lets them pass through.
  const onControl = el => !!(el && el.closest && el.closest('#touch-joy, #touch-btns, #touch-pause, #touch-fs, #cgm-charselect, #cgm-campaign'));
  let tapId = null;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;       // let native mouse path handle desktop-style clicks
    if (onControl(e.target)) return;             // joystick / buttons handle their own pointers
    e.preventDefault();                          // stop scroll/zoom on canvas + menus
    tapId = e.pointerId;
    const p = toCanvas(e); setAim(p.x, p.y);
  }, { passive: false });
  document.addEventListener('pointerup', e => {
    if (e.pointerId !== tapId || onControl(e.target)) return;
    tapId = null;
    const p = toCanvas(e); setAim(p.x, p.y);
    // Drive the EXISTING canvas mousedown/mouseup handlers (unchanged hit-testing).
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: e.clientX, clientY: e.clientY, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mouseup',   { button: 0, clientX: e.clientX, clientY: e.clientY, bubbles: true }));
  }, { passive: false });
  document.addEventListener('pointercancel', () => { tapId = null; });

  // ── landscape hint — only shown during active gameplay in portrait mode ──────
  // On menus (start_menu, character_select, etc.) portrait is usable: the canvas scales down
  // but is tappable. Showing the overlay on menus blocked menu interaction; hide it there.
  function updateRotate() {
    const portrait = (window.matchMedia && window.matchMedia('(orientation: portrait)').matches)
                     || window.innerHeight > window.innerWidth;
    const inGameplay = game.gameState === 'playing';
    rotate.style.display = (portrait && inGameplay) ? 'flex' : 'none';
  }
  window.addEventListener('resize', updateRotate);
  window.addEventListener('orientationchange', updateRotate);
  updateRotate();

  // ── Portrait layout: scale by viewport HEIGHT so menu buttons fill the phone vertically.
  // Registered AFTER main.js resizeCanvas listener so it runs second and can override.
  // In landscape this is a no-op; resizeCanvas already produced the correct scale.
  function applyPortraitLayout() {
    const vv = window.visualViewport;
    const vw = (vv && vv.width)  || window.innerWidth;
    const vh = (vv && vv.height) || window.innerHeight;
    if (vh <= vw) return;                        // landscape — leave resizeCanvas result unchanged
    const scale = vh / 720;                      // fill the portrait height; canvas overflows sides (clipped+centred)
    canvas.style.width  = `${Math.floor(1280 * scale)}px`;
    canvas.style.height = `${Math.floor(720  * scale)}px`;
  }
  window.addEventListener('resize', applyPortraitLayout);
  window.addEventListener('orientationchange', () => setTimeout(applyPortraitLayout, 250));
  applyPortraitLayout();

  let _shown = null, _pauseShown = null, _lastState = null;
  function tick() {
    const g = game;
    const inPlay = g.gameState === 'playing' && !g.paused && !g.gameOver && !g.victory
                   && !g.upgradeUI && !g.mutationUI;
    // A connected+activated controller drives movement/actions directly, so hide the on-screen
    // touch joystick + buttons (they'd be redundant) — even on a phone. Touch returns if the pad
    // goes idle/disconnects. The controller is polled on every platform, so pads work on mobile too.
    const padActive = !!(g._controllerConnected && g._controllerActivated);
    const showTouch = inPlay && !padActive;
    const showPause = g.gameState === 'playing' && !g.gameOver && !g.victory;
    if (showTouch !== _shown) {
      _shown = showTouch;
      joy.style.display  = showTouch ? '' : 'none';
      btns.style.display = showTouch ? '' : 'none';
      if (!showTouch) { joyReset(); clearHeld(); }
    }
    if (showPause !== _pauseShown) { _pauseShown = showPause; pauseB.style.display = showPause ? '' : 'none'; }
    if (g.gameState !== _lastState) { _lastState = g.gameState; updateRotate(); }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { overlay };
}