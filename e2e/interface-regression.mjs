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
    const { renderSelectionPanel, clearSelectionPanel } =
      await import('/js/ui/components/SelectionPanel.js');
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

    // Touch cancellation now runs with native CDP input against the production
    // renderer in e2e/mobile-hand.mjs; synthetic hand DOM no longer represents
    // the delayed-hold layout and produced timing-dependent false failures.

    // ---------- 4. Settings keyboard modal ----------
    const { showSettingsOverlay, hideSettingsOverlay, isSettingsOverlayVisible } =
      await import('/js/ui/overlays/SettingsOverlay.js');
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

    opener.remove();
    return { fail, pass: true };
  });

  // Real browser keyboard navigation, in addition to handler-level checks above.
  await page.evaluate(async () => {
    (await import('/js/ui/overlays/SettingsOverlay.js')).showSettingsOverlay();
  });
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    if (
      !(await page.evaluate(() =>
        document.querySelector('#settings-floating-overlay').contains(document.activeElement)
      ))
    )
      failures.push('native keyboard escaped Settings');
  }
  await page.keyboard.press('Escape');
  if (
    await page.evaluate(async () =>
      (await import('/js/ui/overlays/SettingsOverlay.js')).isSettingsOverlayVisible()
    )
  )
    failures.push('native Escape did not close Settings');
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
console.log(
  'PASS — SelectionPanel and Settings modal regressions hold (native touch: mobile-hand.mjs).'
);
