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

export function initTouchControls({ canvas, keys, game, setAim }) {
  if (!isTouchDevice()) return null;   // desktop: do nothing at all

  // ── styles ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #touch-overlay { position: fixed; inset: 0; z-index: 50; pointer-events: none;
      touch-action: none; -webkit-user-select: none; user-select: none; }
    #touch-overlay .tc { pointer-events: auto; touch-action: none;
      -webkit-tap-highlight-color: transparent; }
    #touch-joy { position: absolute; left: 4%; bottom: 8%; width: 132px; height: 132px;
      border-radius: 50%; background: rgba(120,160,200,0.10);
      border: 2px solid rgba(150,200,255,0.35); }
    #touch-joy-knob { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px;
      margin: -29px 0 0 -29px; border-radius: 50%;
      background: rgba(150,210,255,0.30); border: 2px solid rgba(180,230,255,0.6);
      box-shadow: 0 0 14px rgba(120,200,255,0.5); }
    #touch-btns { position: absolute; right: 4%; bottom: 7%; width: 210px; height: 150px; }
    #touch-btns button, #touch-pause { position: absolute; border-radius: 50%;
      font: bold 14px Consolas, monospace; color: #dff2ff;
      background: rgba(20,40,70,0.45); border: 2px solid rgba(150,200,255,0.5);
      box-shadow: 0 0 10px rgba(80,150,220,0.35); }
    #touch-btns button:active, #touch-pause:active { background: rgba(60,120,200,0.6); }
    #touch-btns button { width: 70px; height: 70px; }
    #btn-ult   { right: 0;   bottom: 78px; width: 80px; height: 80px; color: #ffd9a8;
      border-color: rgba(255,140,60,0.7); }
    #btn-dash  { right: 92px; bottom: 70px; color: #bfe9ff; }
    #btn-q     { right: 96px; bottom: 0; }
    #btn-e     { right: 4px;  bottom: 0; }
    #touch-pause { top: 12px; right: 12px; width: 50px; height: 50px; font-size: 18px; }
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
    <button id="touch-pause" class="tc" data-hold="0" data-key="Escape">⏸</button>`;
  document.body.appendChild(overlay);

  const rotate = document.createElement('div');
  rotate.id = 'touch-rotate';
  rotate.innerHTML = '<span>⟳ Rotate your device to LANDSCAPE for the best experience</span>';
  document.body.appendChild(rotate);

  const joy    = overlay.querySelector('#touch-joy');
  const knob   = overlay.querySelector('#touch-joy-knob');
  const btns   = overlay.querySelector('#touch-btns');
  const pauseB = overlay.querySelector('#touch-pause');

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
  const DEAD = 16, MAXR = 46;
  let joyId = null;
  function joyCenter() { const r = joy.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function joyMove(touch) {
    const c = joyCenter();
    let dx = touch.clientX - c.x, dy = touch.clientY - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > MAXR) { dx *= MAXR / dist; dy *= MAXR / dist; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    setKey('w', dy < -DEAD); setKey('s', dy > DEAD);
    setKey('a', dx < -DEAD); setKey('d', dx > DEAD);
  }
  function joyReset() {
    joyId = null; knob.style.transform = '';
    setKey('w', false); setKey('s', false); setKey('a', false); setKey('d', false);
  }
  joy.addEventListener('touchstart', e => {
    e.preventDefault();
    if (joyId === null) { joyId = e.changedTouches[0].identifier; joyMove(e.changedTouches[0]); }
  }, { passive: false });
  joy.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t);
  }, { passive: false });
  const joyEnd = e => { for (const t of e.changedTouches) if (t.identifier === joyId) joyReset(); };
  joy.addEventListener('touchend', joyEnd);
  joy.addEventListener('touchcancel', joyEnd);

  // ── action buttons (Dash held; Q/E/ULT/Pause one-shot) ────────────────────
  function bindButton(el) {
    const key = el.dataset.key, hold = el.dataset.hold === '1';
    el.addEventListener('touchstart', e => {
      e.preventDefault();                       // no 300ms delay / no synthetic mouse
      if (hold) setKey(key, true);              // Dash → held 'shift' in keys Set
      else      tapKey(key);                    // Q/E/ULT/Pause → synthetic keydown+keyup
    }, { passive: false });
    if (hold) {
      const up = e => { e.preventDefault(); setKey(key, false); };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
  }
  btns.querySelectorAll('button').forEach(bindButton);
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
  const onControl = el => !!(el && el.closest && el.closest('#touch-joy, #touch-btns, #touch-pause'));
  let tapStart = null;
  document.addEventListener('touchstart', e => {
    if (onControl(e.target)) return;            // joystick / buttons handle their own touches
    e.preventDefault();                          // stop scroll/zoom on canvas + menus
    const t = e.changedTouches[0]; tapStart = t;
    const p = toCanvas(t); setAim(p.x, p.y);
  }, { passive: false });
  document.addEventListener('touchend', e => {
    if (tapStart === null || onControl(e.target)) return;
    let t = null; for (const c of e.changedTouches) if (c.identifier === tapStart.identifier) t = c;
    if (!t) t = e.changedTouches[0];
    const p = toCanvas(t); setAim(p.x, p.y);
    // Drive the EXISTING canvas mousedown/mouseup handlers (unchanged hit-testing).
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: t.clientX, clientY: t.clientY, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mouseup',   { button: 0, clientX: t.clientX, clientY: t.clientY, bubbles: true }));
    tapStart = null;
  }, { passive: false });
  document.addEventListener('touchcancel', () => { tapStart = null; });

  // ── landscape hint + show controls only during active gameplay ────────────
  function updateRotate() {
    const portrait = (window.matchMedia && window.matchMedia('(orientation: portrait)').matches)
                     || window.innerHeight > window.innerWidth;
    rotate.style.display = portrait ? 'flex' : 'none';
  }
  window.addEventListener('resize', updateRotate);
  window.addEventListener('orientationchange', updateRotate);
  updateRotate();

  let _shown = null, _pauseShown = null;
  function tick() {
    const g = game;
    const inPlay = g.gameState === 'playing' && !g.paused && !g.gameOver && !g.victory
                   && !g.upgradeUI && !g.mutationUI;
    const showPause = g.gameState === 'playing' && !g.gameOver && !g.victory;
    if (inPlay !== _shown) {
      _shown = inPlay;
      joy.style.display  = inPlay ? '' : 'none';
      btns.style.display = inPlay ? '' : 'none';
      if (!inPlay) { joyReset(); clearHeld(); }   // never leave movement/dash stuck on a menu/card
    }
    if (showPause !== _pauseShown) { _pauseShown = showPause; pauseB.style.display = showPause ? '' : 'none'; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { overlay };
}
