/** Component regression: browser scroll-to-card must not move the scoreboard.
 * Uses production card rendering with a fixed eight-card hand; no multiplayer writes.
 * TCG_CHROME overrides the Playwright executable; serve the repo on :8123.
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(process.env.TCG_BASE || 'http://127.0.0.1:8123');
  await page.waitForFunction(() => !!window.__qa);
  const result = await page.evaluate(async () => {
    const { renderCard } = await import('/js/ui/components/Card.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const hand = document.querySelector('#active-hand');
    hand.replaceChildren(
      ...Array.from({ length: 8 }, () =>
        renderCard(createCardInstance(getCardDefinitionById('fish-predator-great-white-shark'), 1))
      )
    );
    await document.fonts.ready;
    const header = document.querySelector('#scoreboard-row');
    const column = document.querySelector('.battlefield-center-column');
    const before = header.getBoundingClientRect().top;
    hand.lastElementChild.scrollIntoView({ block: 'end', inline: 'nearest' });
    const after = header.getBoundingClientRect().top;
    const ancestors = [];
    for (let el = header.parentElement; el; el = el.parentElement)
      ancestors.push({
        name: el.className || el.tagName,
        scrollTop: el.scrollTop,
        height: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflow: getComputedStyle(el).overflow,
      });
    return {
      ancestors,
      before,
      after,
      drift: after - before,
      scrollTop: column.scrollTop,
      overflowX: getComputedStyle(column).overflowX,
      overflowY: getComputedStyle(column).overflowY,
    };
  });
  console.log(JSON.stringify(result));
  assert.ok(
    Math.abs(result.drift) < 1,
    `Header moved ${result.drift}px when scrolling a hand card into view`
  );
} finally {
  await browser.close();
}
