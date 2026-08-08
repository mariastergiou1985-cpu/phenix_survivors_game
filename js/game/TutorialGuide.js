/**
 * TutorialGuide.js — PHENIX: NULL EDEN
 * First-run guided tutorial (2026-08-08, Maria).
 *
 * Overlay-only: dark veil + highlight cutout + 1-2 lines + CONTINUE ανά βήμα.
 * ΔΕΝ αγγίζει gameplay/flow — απλώς κάθεται πάνω από τα υπάρχοντα screens και
 * προχωράει με trigger ανά οθόνη/γεγονός (άρα αντέχει branching: endless run
 * δεν έχει act select, το βήμα απλώς δεν εμφανίζεται).
 *
 * Input: keyboard (Enter/Space) + controller (A/Cross μέσω δικού του poll) +
 * click στο CONTINUE. Όσο είναι ορατό: capture-phase keydown swallow (κανένα
 * bleed σε UI/gameplay από πίσω), keyup ΠΕΡΝΑΕΙ (δεν κολλάνε held κινήσεις),
 * και το main.js gamepad poll κόβεται μέσω window.__phenixTutModal.
 *
 * Persistence: localStorage 'phenix_tutorial_v1' {seen:[], done:bool}.
 * Υπάρχον save (stagesCleared/endlessUnlocked) => auto-done (δεν ενοχλεί
 * παλιούς παίκτες). QA harness (?qa=1 / phenix_qa_optin) => inert, εκτός αν
 * window.__phenixTutorialForce (ώστε να μη σπάσει ΚΑΝΕΝΑ υπάρχον proof).
 * Replay: SETTINGS → REPLAY TUTORIAL → game._tutorial.replay().
 */

const TUT_KEY = 'phenix_tutorial_v1';

const STEPS = [
  { id: 'menu_start',
    when: (g) => g.gameState === 'start_menu',
    target: () => document.querySelector('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]'),
    title: 'WELCOME TO NULL EDEN',
    text: 'Everything begins at START GAME. The SYSTEM is waiting for you, pilot.' },
  { id: 'mode_select',
    when: (g) => g.gameState === 'mode_select',
    target: () => document.querySelector('#cgm-modesel'),
    title: 'PICK YOUR MODE',
    text: 'CAMPAIGN pushes the story act by act. ENDLESS is pure survival. CHAOS bends the rules.' },
  { id: 'stage_select',
    when: (g) => g.gameState === 'act_select' || g.gameState === 'campaign_select',
    target: () => null,
    title: 'CHOOSE YOUR STAGE',
    text: 'Each act is a different sector of the SYSTEM. Clear a stage to unlock the next one.' },
  { id: 'char_select',
    when: (g) => g.gameState === 'character_select',
    target: () => document.querySelector('.csc-grid'),
    title: 'CHOOSE YOUR FIGHTER',
    text: 'Every character has a unique starter weapon, speed and role - check the stats panel on the right.' },
  { id: 'movement',
    when: (g) => g.gameState === 'playing' && g.player && (g.timeAlive || 0) < 6,
    target: () => null,
    title: 'MOVE OR DIE',
    text: 'Move with WASD / arrow keys, or the left stick. Your weapons fire on their own - positioning is everything.' },
  { id: 'dash_ult',
    when: (g, t) => g.gameState === 'playing' && t.seen.has('movement') && (g.timeAlive || 0) >= 5,
    target: () => null,
    title: 'DASH + ULTIMATE',
    text: 'SHIFT / RT dashes you out of danger. When your ULT bar is full, press SPACE / Y to unleash your Ultimate.' },
  { id: 'level_up',
    when: (g) => g.gameState === 'playing' && g.player && g.player.level >= 2,
    target: () => null,
    title: 'LEVEL UP',
    text: 'Leveling up offers upgrade cards - pick ONE. Build your run around cards that feed each other.' },
  { id: 'weapons',
    when: (g, t) => t.seen.has('level_up'),
    target: () => null,
    title: 'WEAPONS + EVOLUTIONS',
    text: 'Weapon cards level your arsenal. Maxed weapons can merge into powerful EVOLUTIONS - watch for glowing cards.' },
  { id: 'relics',
    when: (g, t) => g.gameState === 'start_menu' && t.seen.has('movement'),
    target: () => document.querySelector('#cgm-menu-nav .mbtn[data-cgm-item="NULL ARSENAL"]'),
    title: 'RELICS',
    text: 'In NULL ARSENAL you spend what you earn on RELICS - permanent passive powers that boost every future run.' },
];

export class TutorialGuide {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this.stepIdx = -1;
    this._el = null;
    this._padWasDown = false;
    this._raf = null;
    const st = this._load();
    this.seen = new Set(st.seen || []);
    this.done = !!st.done;
    // QA harness => inert (κανένα υπάρχον proof δεν πρέπει να δει overlay)
    this._qaInert = false;
    try {
      const qa = /[?&]qa=1/.test(location.search) || sessionStorage.getItem('phenix_qa_optin') === '1';
      if (qa && !window.__phenixTutorialForce) this._qaInert = true;
    } catch (_) {}
    // Υπάρχον save => μην ενοχλείς παλιό παίκτη: auto-done μία φορά
    if (!this.done && this._hasExistingProgress()) { this.done = true; this._save(); }
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown, { capture: true });
    window.addEventListener('keyup', this._onKeyUp, { capture: true });
    try { window.__phenixTutorial = this; } catch (_) {}
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  _hasExistingProgress() {
    try {
      const m = JSON.parse(localStorage.getItem('phenix_meta') || 'null');
      if (m && ((m.stagesCleared | 0) >= 1 || m.endlessUnlocked || (m.totalRuns | 0) >= 1)) return true;
    } catch (_) {}
    return false;
  }
  _load() {
    try { return JSON.parse(localStorage.getItem(TUT_KEY) || 'null') || {}; } catch (_) { return {}; }
  }
  _save() {
    try { localStorage.setItem(TUT_KEY, JSON.stringify({ seen: [...this.seen], done: this.done })); } catch (_) {}
  }

  /** SETTINGS → REPLAY TUTORIAL */
  replay() {
    this.seen.clear(); this.done = false; this._qaInert = false; this._save();
    this.game.goToMainMenu?.();
  }

  _ensureDom() {
    if (this._el) return;
    const ov = document.createElement('div');
    ov.id = 'tut-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147480000;display:none;pointer-events:auto;font-family:Orbitron,system-ui,sans-serif;';
    ov.innerHTML =
      '<div id="tut-hl" style="position:absolute;border:2px solid #2ee6f6;border-radius:12px;' +
        'box-shadow:0 0 0 100000px rgba(3,6,14,0.82),0 0 26px rgba(46,230,246,0.8);transition:all .25s ease;"></div>' +
      '<div id="tut-card" style="position:absolute;max-width:520px;padding:18px 22px;border-radius:12px;' +
        'border:1px solid rgba(46,230,246,.6);background:linear-gradient(180deg,rgba(8,16,32,.97),rgba(4,8,18,.97));' +
        'box-shadow:0 0 24px rgba(46,230,246,.25);color:#d8f4ff;">' +
        '<div id="tut-title" style="font-weight:800;font-size:15px;letter-spacing:2px;color:#2ee6f6;margin-bottom:8px;"></div>' +
        '<div id="tut-text" style="font-size:13px;line-height:1.55;letter-spacing:.4px;"></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;">' +
          '<div id="tut-dots" style="font-size:11px;letter-spacing:3px;color:#5f8aa8;"></div>' +
          '<button id="tut-continue" style="cursor:pointer;padding:9px 22px;border-radius:9px;border:1px solid #2ee6f6;' +
            'background:rgba(46,230,246,.12);color:#eaffff;font-family:inherit;font-weight:800;font-size:12px;letter-spacing:2px;">' +
            'CONTINUE <span style="opacity:.6;font-weight:400;">(ENTER / A)</span></button>' +
        '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', (e) => { e.stopPropagation(); }, { capture: false });
    ov.querySelector('#tut-continue').addEventListener('click', (e) => { e.stopPropagation(); this._continue(); });
    this._el = ov;
  }

  _show(idx) {
    this._ensureDom();
    this.stepIdx = idx;
    this.visible = true;
    window.__phenixTutModal = true;
    const s = STEPS[idx];
    this._el.style.display = 'block';
    this._el.querySelector('#tut-title').textContent = s.title;
    this._el.querySelector('#tut-text').textContent = s.text;
    const shown = [...this.seen].length + 1;
    this._el.querySelector('#tut-dots').textContent = 'STEP ' + shown + ' / ' + STEPS.length;
    this._position(s);
  }

  _position(s) {
    const hl = this._el.querySelector('#tut-hl');
    const card = this._el.querySelector('#tut-card');
    let r = null;
    try { const t = s.target?.(); if (t && t.getBoundingClientRect) r = t.getBoundingClientRect(); } catch (_) {}
    if (r && r.width > 4 && r.height > 4) {
      hl.style.display = 'block';
      hl.style.left = (r.left - 8) + 'px'; hl.style.top = (r.top - 8) + 'px';
      hl.style.width = (r.width + 16) + 'px'; hl.style.height = (r.height + 16) + 'px';
      const below = r.bottom + 190 < innerHeight;
      card.style.left = Math.max(16, Math.min(innerWidth - 560, r.left + r.width / 2 - 260)) + 'px';
      card.style.top = (below ? r.bottom + 18 : Math.max(14, r.top - 178)) + 'px';
    } else {
      // κανένα DOM target (canvas οθόνες / in-run): πλήρες dark veil + κεντρική κάρτα
      hl.style.display = 'block';
      hl.style.left = '50%'; hl.style.top = '-12px'; hl.style.width = '0px'; hl.style.height = '0px';
      card.style.left = Math.max(16, innerWidth / 2 - 260) + 'px';
      card.style.top = Math.round(innerHeight * 0.16) + 'px';
    }
  }

  _hide() {
    this.visible = false;
    window.__phenixTutModal = false;
    if (this._el) this._el.style.display = 'none';
  }

  _continue() {
    if (!this.visible) return;
    const s = STEPS[this.stepIdx];
    if (s) { this.seen.add(s.id); }
    if (this.seen.size >= STEPS.length || (s && s.id === 'relics')) { this.done = true; }
    this._save();
    this._hide();
  }

  _onKeyDown(e) {
    if (!this.visible) return;
    // ΑΦΗΣΕ system keys (refresh/devtools/fullscreen)
    if (e.key === 'F5' || e.key === 'F11' || e.key === 'F12' || (e.ctrlKey && !e.altKey)) return;
    if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault(); e.stopImmediatePropagation();
      this._continue();
      return;
    }
    // Κανένα bleed: όλα τα υπόλοιπα keydown καταναλώνονται όσο το βήμα είναι ανοιχτό
    e.preventDefault(); e.stopImmediatePropagation();
  }
  _onKeyUp(_e) { /* τα keyup περνούν πάντα — δεν κολλάνε held κινήσεις */ }

  _padContinuePressed() {
    let down = false;
    try {
      for (const gp of (navigator.getGamepads?.() || [])) {
        if (gp && gp.buttons && gp.buttons[0] && gp.buttons[0].pressed) { down = true; break; }
      }
    } catch (_) {}
    const edge = down && !this._padWasDown;
    this._padWasDown = down;
    return edge;
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    if (this.done || this._qaInert) { if (this.visible) this._hide(); return; }
    const g = this.game;
    if (!g) return;
    if (this.visible) {
      const s = STEPS[this.stepIdx];
      if (s) this._position(s);                      // ακολουθεί layout/resize
      if (this._padContinuePressed()) this._continue();
      return;
    }
    this._padContinuePressed();                      // κρατάει το edge state φρέσκο
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (this.seen.has(s.id)) continue;
      let ok = false;
      try { ok = !!s.when(g, this); } catch (_) { ok = false; }
      if (ok) { this._show(i); return; }
    }
  }
}
