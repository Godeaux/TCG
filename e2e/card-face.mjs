// Real renderer/catalog geometry contract; no game-state or transport simulation.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '8199', '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({
  ...(process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}),
});
try {
  const p = await browser.newPage();
  await p.goto('http://127.0.0.1:8199');
  await p.waitForFunction(() => !!window.__qa);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    await p.setViewportSize(viewport);
    const report = await p.evaluate(async () => {
      const { getAllCards } = await import('/js/cards/index.js');
      const { renderCard } = await import('/js/ui/components/Card.js');
      const host = document.createElement('div');
      host.style = 'position:absolute;top:0;left:0;z-index:99999;background:#12303c';
      document.body.append(host);
      const bad = [];
      let count = 0;
      for (const context of [
        'plain',
        'history',
        'selector',
        'editor',
        'inspector',
        'hand',
        'collection',
        'pack',
        'spell',
        'trap',
      ]) {
        if (context === 'history' && innerWidth < 768) continue;
        const surface = document.createElement('div');
        surface.innerHTML =
          context === 'history'
            ? '<div class="history-detail"><div class="history-tile history-full-card"></div></div>'
            : context === 'selector'
              ? '<div class="card-selection-overlay-grid"></div>'
              : context === 'editor'
                ? '<div id="deck-overlay"><div class="deck-grid"></div></div>'
                : context === 'inspector'
                  ? '<div class="modern-inspector"><div class="tooltip-card-preview"></div></div>'
                  : context === 'hand'
                    ? '<div class="game-container"><div class="hand-grid"></div></div>'
                    : '<div></div>';
        host.append(surface);
        const target =
          surface.querySelector(
            '.card-selection-overlay-grid,.deck-grid,.tooltip-card-preview,.hand-grid,.history-full-card'
          ) || surface.firstElementChild;
        for (const width of context === 'history' ? [130, 145, 165, 240] : [150, 194, 260, 320])
          for (const card of getAllCards()) {
            const el = renderCard(card, { showEffectSummary: true });
            if (context === 'history') el.classList.add('history-card-face');
            if (context === 'collection') el.classList.add('collection-card');
            if (context === 'pack') el.classList.add('pack-revealed-card');
            if (context === 'spell' || context === 'trap') {
              el.classList.add(context + '-reveal-card-front');
              el.style.setProperty('transform', 'none', 'important');
              el.style.setProperty('transition', 'none', 'important');
              el.querySelector('.card-name-text').classList.add(context + '-reveal-name');
              el.querySelector('.card-effect-text')?.classList.add(context + '-reveal-effect');
            }

            el.style.setProperty('width', width + 'px', 'important');
            target.append(el);
            const inner = el.querySelector('.card-inner').getBoundingClientRect();
            const face = el.getBoundingClientRect();
            const art = el.querySelector('.card-image-container').getBoundingClientRect();
            if (
              Math.abs(face.width / face.height - 5 / 7) > 0.002 ||
              Math.abs(art.height / inner.height - 0.46) > 0.002
            )
              bad.push({ id: card.id, width, kind: 'geometry' });
            for (const [area, content] of [
              ['.card-name', '.card-name-text'],
              ['.card-effect', '.card-effect-text'],
              ['.card-keywords', '.card-keywords-text'],
            ]) {
              const a = el.querySelector(area),
                t = el.querySelector(content);
              if (!a || !t) continue;
              const ar = a.getBoundingClientRect(),
                tr = t.getBoundingClientRect();
              if (
                tr.right > ar.right + 1 ||
                tr.left < ar.left - 1 ||
                tr.bottom > ar.bottom + 1 ||
                tr.top < ar.top - 1 ||
                t.scrollWidth > t.clientWidth + 1
              )
                bad.push({
                  id: card.id,
                  width,
                  kind: content,
                  available: ar.height,
                  needed: tr.height,
                  context,
                  at: ar.toJSON(),
                  tt: tr.toJSON(),
                  scroll: t.scrollWidth,
                  client: t.clientWidth,
                });
              if (
                area === '.card-effect' &&
                ['auto', 'scroll'].includes(getComputedStyle(a).overflowY)
              )
                bad.push({ id: card.id, kind: 'scroll' });
            }
            count++;
            el.remove();
          }
        surface.remove();
      }
      host.remove();
      return { count, bad };
    });
    assert.equal(report.bad.length, 0, JSON.stringify({ viewport, ...report }));
    console.log(
      'PASS',
      viewport,
      report.count,
      'real card/size combinations; identical geometry, all text fits, no scrolling'
    );
  }
} finally {
  await browser.close();
  server.kill();
}
