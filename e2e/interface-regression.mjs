// Real regression assertions for the bounded interface fixes in
// docs/UI-RECOVERY-REVIEW-2026-10-21.md sections 2, 3 and 4.
// Unlike review-ui-recovery.mjs (diagnostic only), this exits non-zero on failure.
//
// Run a static server on port 8123, then: node e2e/interface-regression.mjs
// Set TCG_BASE / TCG_CHROME if needed.
import { chromium } from '@playwright/test';

const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

const failures = [];
try {
  await page.goto(process.env.TCG_BASE || 'http://127.0.0.1:8123');
  await page.waitForFunction(() => !!window.__qa);

  const results = await page.evaluate(async () => {
    const out = {};
    const fail = [];
    const ok = (name, cond, detail) => {
      if (!cond) fail.push(`${name}${detail === undefined ? '' : ` (${JSON.stringify(detail)})`}`);
    };

    // ---------- 2. SelectionPanel minimize leak ----------
    const { renderSelectionPanel, clearSelectionPanel } = await import(
      '/js/ui/components/SelectionPanel.js'
    );
    const panel = () => document.querySelector('#selection-panel');
    const hideBtn = () => document.querySelector('#selection-panel .hide-panel-btn');
    const contentVisible = () =>
      getComputedStyle(document.querySelector('#selection-panel .selection-content')).display !==
      'none';

    renderSelectionPanel({ title: 'Prompt A', items: [], onConfirm: () => {} });
    ok('A starts expanded', !panel().classList.contains('minimized') && contentVisible());
    ok('A label is Hide', hideBtn().textContent === 'Hide');
    hideBtn().click(); // user hides prompt A
    ok('A minimized after Hide', panel().classList.contains('minimized'));
    ok('A label is Show when hidden', hideBtn().textContent === 'Show');
    ok('A aria-expanded false', hideBtn().getAttribute('aria-expanded') === 'false');

    clearSelectionPanel();
    renderSelectionPanel({ title: 'Prompt B', items: [], onConfirm: () => {} });
    ok('B not minimized', !panel().classList.contains('minimized'));
    ok('B label is Hide', hideBtn().textContent === 'Hide');
    ok('B content visible at 390px', contentVisible());
    ok('B aria-expanded true', hideBtn().getAttribute('aria-expanded') === 'true');

    // Same-prompt re-render must NOT force-expand a minimized prompt.
    hideBtn().click();
    renderSelectionPanel({ title: 'Prompt B', items: [], onConfirm: () => {} });
    ok('same-prompt re-render keeps minimized', panel().classList.contains('minimized'));
    ok('same-prompt label stays Show', hideBtn().textContent === 'Show');
    hideBtn().click(); // back to expanded for hygiene
    clearSelectionPanel();

    // Keyboard access: the hide control is a real button and focusable.
    renderSelectionPanel({ title: 'Keyboard', items: [], onConfirm: () => {} });
    hideBtn().focus();
    ok('hide button focusable', document.activeElement === hideBtn());
    clearSelectionPanel();

    // ---------- 3. Touch cancellation cleanup ----------
    const { updateDragState } = await import('/js/ui/input/dragAndDrop.js');
    const { initTouchHandlers } = await import('/js/ui/input/touchHandlers.js');
    const { createGameState } = await import('/js/state/gameState.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/registry.js');

    const s = createGameState();
    s.phase = 'Main 1';
    s.setup.stage = 'complete';
    s.deckSelection.stage = 'complete';
    const hand = createCardInstance(getCardDefinitionById('amphibian-prey-axolotl'), 1);
    s.players[0].hand = [hand];
    updateDragState(s);
    // Reuse the app's real hand grid (initTouchHandlers binds by id) and give it
    // a deterministic, hit-testable geometry at 390x844.
    const grid = document.getElementById('active-hand');
    grid.innerHTML = '';
    grid.style.cssText =
      'position:fixed;left:0;top:0;width:390px;height:400px;z-index:99999;background:#000';
    grid.innerHTML =
      '<div class="card" style="position:absolute;left:30px;top:30px;width:100px;height:150px" data-instance-id="' +
      hand.instanceId +
      '">Axolotl</div>';
    if (!document.querySelector('.player-field')) {
      document.body.insertAdjacentHTML('beforeend', '<div class="player-field"></div>');
    }
    initTouchHandlers();
    const el = grid.querySelector('.card');
    const touchAt = (type, target, x, y) => {
      const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' || type === 'touchcancel' ? [] : [t],
          changedTouches: [t],
        })
      );
    };
    const fieldHpBefore = s.players[1].hp;
    const handCountBefore = s.players[0].hand.length;

    // Cancel before dragging: inspection UI must clear, nothing plays.
    touchAt('touchstart', el, 80, 80);
    const focusedOnStart = el.classList.contains('hand-focus');
    touchAt('touchcancel', el, 80, 80);
    ok('touchstart focuses card', focusedOnStart);
    ok('cancel clears hand-focus', !el.classList.contains('hand-focus'));

    // Cancel during dragging: preview gone, no dragging classes, no card played.
    touchAt('touchstart', el, 80, 80);
    touchAt('touchmove', el, 80, 20); // past VERTICAL_DRAG_THRESHOLD
    const draggingStarted = el.classList.contains('dragging');
    const previewExisted = !!document.querySelector('.mobile-drag-preview');
    touchAt('touchcancel', el, 80, 20);
    ok('drag actually started', draggingStarted && previewExisted);
    ok(
      'cancel removes dragging class',
      !el.classList.contains('dragging') && !document.querySelector('.card.dragging')
    );
    ok('cancel removes preview', !document.querySelector('.mobile-drag-preview'));
    ok('cancel clears hand-focus after drag', !el.classList.contains('hand-focus'));
    ok('cancel removes container drag classes', !grid.classList.contains('is-dragging'));
    ok('cancel played no card', s.players[0].hand.length === handCountBefore);
    ok('cancel dealt no damage', s.players[1].hp === fieldHpBefore);

    // Fresh gesture after cancellation works normally.
    touchAt('touchstart', el, 80, 80);
    const refocused = el.classList.contains('hand-focus');
    touchAt('touchend', el, 80, 80);
    ok('fresh gesture focuses after cancel', refocused);

    // ---------- 4. Settings keyboard modal ----------
    const { showSettingsOverlay, hideSettingsOverlay, isSettingsOverlayVisible } = await import(
      '/js/ui/overlays/SettingsOverlay.js'
    );
    const opener = document.createElement('button');
    opener.id = 'regression-opener';
    document.body.append(opener);
    opener.focus();

    showSettingsOverlay();
    const overlay = document.querySelector('#settings-floating-overlay');
    ok('role=dialog', overlay.getAttribute('role') === 'dialog');
    ok('aria-modal=true', overlay.getAttribute('aria-modal') === 'true');
    ok('has accessible name', (overlay.getAttribute('aria-label') || '').length > 0);
    ok('initial focus inside', overlay.contains(document.activeElement));
    ok('opener not focused', document.activeElement !== opener);

    // Tab containment: focus stays inside across many cycles.
    let escaped = false;
    for (let i = 0; i < 12; i++) {
      const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.activeElement.dispatchEvent(ev);
      if (!overlay.contains(document.activeElement)) escaped = true;
    }
    ok('Tab containment holds', !escaped);

    // Escape closes and restores focus to the opener.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('Escape closes', !isSettingsOverlayVisible());
    ok('focus restored to opener', document.activeElement === opener);

    // Done button path + repeated open/Escape cycles must not stack listeners:
    // after close, one Escape must NOT re-trigger close (no stale handler), and
    // each open still closes on exactly one Escape.
    for (let cycle = 0; cycle < 3; cycle++) {
      opener.focus();
      showSettingsOverlay();
      ok(`cycle ${cycle}: focus inside`, overlay.contains(document.activeElement));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      ok(`cycle ${cycle}: one Escape closes`, !isSettingsOverlayVisible());
      ok(`cycle ${cycle}: focus restored`, document.activeElement === opener);
    }
    // Done button closes too.
    opener.focus();
    showSettingsOverlay();
    document.querySelector('#settings-overlay-done').click();
    ok('Done closes', !isSettingsOverlayVisible());
    ok('Done restores focus', document.activeElement === opener);
    // Background Escape after close is inert (no throw, stays closed).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('still closed after stray Escape', !isSettingsOverlayVisible());
    hideSettingsOverlay(); // idempotent when already closed

    grid.innerHTML = '';
    grid.style.cssText = '';
    opener.remove();
    return { fail, pass: true };
  });

  if (results.fail.length > 0) {
    for (const f of results.fail) failures.push(f);
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`FAIL — ${failures.length} assertion(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('PASS — SelectionPanel, touch-cancel and Settings modal regressions all hold.');
