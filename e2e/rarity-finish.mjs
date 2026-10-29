// Real card renderer and browser styles; no persistence or gameplay injection.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const server = spawn('python3', ['-m', 'http.server', '8187', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const browser = await chromium.launch(process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {});
const out = 'docs/rarity-finish';
await fs.mkdir(out, { recursive: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8187');
  await page.waitForFunction(() => !!window.__qa);
  for (const [width, height] of [[1440, 900], [393, 852], [320, 568]]) {
    await page.setViewportSize({width, height});
    const report = await page.evaluate(async () => {
      const {getAllCards} = await import('/js/cards/index.js');
      const {renderCard} = await import('/js/ui/components/Card.js');
      document.querySelector('#finish-review')?.remove();
      const host = document.createElement('section');
      host.id = 'finish-review';
      host.style = 'position:fixed;inset:0;z-index:999999;background:#101925;overflow:auto;padding:28px;display:flex;gap:28px;align-content:start;align-items:start;flex-wrap:wrap;color:white';
      document.body.append(host);
      const original = getAllCards().find(c => c.id === 'fish-predator-orca');
      const before = JSON.stringify(original);
      const rows = [];
      for(const rarity of ['common','uncommon','rare','legendary','pristine']) {
        const tile = document.createElement('article');
        tile.style = `width:${innerWidth > 700 ? 240 : innerWidth - 70}px;flex-shrink:0;padding-bottom:20px`;
        const label = document.createElement('p'); label.textContent = rarity; tile.append(label);
        const card = renderCard({...original, rarity}, {showEffectSummary:true,useBaseStats:true});
        card.style.setProperty('width','100%','important'); tile.append(card); host.append(tile);
        const face = card.getBoundingClientRect();
        const inner = card.querySelector('.card-inner').getBoundingClientRect();
        const art = card.querySelector('.card-image-container').getBoundingClientRect();
        const name = card.querySelector('.card-name');
        const seal = card.querySelector('.card-rarity-seal');
        const sealBox = seal.getBoundingClientRect();
        rows.push({rarity,ratio:face.width/face.height,art:art.height/inner.height,
          seal:seal.getAttribute('aria-label'),marks:seal.querySelectorAll('circle').length,
          foil:getComputedStyle(card.querySelector('.card-opal-foil')).opacity,
          ink:getComputedStyle(name).webkitTextFillColor,
          animation:getComputedStyle(card).animationName,
          inside:sealBox.left>=face.left && sealBox.right<=face.right,
          pointer:getComputedStyle(seal).pointerEvents});
      }
      const hidden = renderCard({...original,rarity:'pristine'}, {showBack:true}); host.append(hidden);
      const noLeak = !hidden.querySelector('.card-rarity-seal,.card-opal-foil') && !hidden.dataset.rarity;
      hidden.remove();
      const unowned = renderCard(original); const noOwnedSeal = !unowned.querySelector('.card-rarity-seal');
      const selected = renderCard({...original,rarity:'pristine'}, {isSelected:true});host.append(selected);
      const selectedBorder = getComputedStyle(selected).borderColor;
      selected.classList.remove('card-selected');selected.classList.add('can-attack-pulse');
      const attackAnimation = getComputedStyle(selected).animationName;selected.remove();
      return {rows,noLeak,noOwnedSeal,unchanged:before===JSON.stringify(original),selectedBorder,attackAnimation};
    });
    expect(report.noLeak).toBe(true);expect(report.noOwnedSeal).toBe(true);expect(report.unchanged).toBe(true);
    expect(report.selectedBorder).toBe('rgb(212, 168, 83)');
    expect(report.attackAnimation).toBe('can-attack-pulse');
    for (const [i,row] of report.rows.entries()) {
      expect(Math.abs(row.ratio-5/7)).toBeLessThan(.006);
      expect(Math.abs(row.art-.46)).toBeLessThan(.006);
      expect(row.marks).toBe(i+1);expect(row.seal).toBe(`${row.rarity} rarity`);
      expect(row.animation).toBe('none');expect(row.inside).toBe(true);
      expect(row.pointer).toBe('none');expect(Number(row.foil)).toBe([0,.2,.5,.65,.8][i]);
      expect(row.ink).not.toBe('rgba(0, 0, 0, 0)');
    }
    await page.screenshot({path:`${out}/${width}.png`});
    await fs.writeFile(`${out}/${width}.json`,JSON.stringify(report,null,2));
  }
  await page.evaluate(() => document.querySelector('#finish-review')?.remove());
  // Presentation fixture only: no account ID, API calls, or persisted ownership.
  for (const rarity of ['common','uncommon','rare','legendary','pristine']) {
    await page.evaluate(async rarity => {
      const pe = await import('/js/ui/overlays/PlayerExperience.js');
      pe.resetPlayerExperience();
      pe.renderPlayerExperience({menu:{stage:'collection',profile:{
        ownedCards:new Map([['fish-predator-orca',rarity]])
      }}});
    }, rarity);
    await expect(page.locator('.pe-grid .canonical-card')).toHaveAttribute('data-rarity',rarity);
    await page.locator('.pe-grid .pe-tile').click();
    await expect(page.locator('.pe-mobile-inspection .canonical-card')).toHaveAttribute('data-rarity',rarity);
    await expect(page.locator('.pe-mobile-inspection .card-rarity-seal')).toHaveAttribute('aria-label',`${rarity} rarity`);
    if (rarity === 'pristine') await page.screenshot({path:`${out}/phone-inspector-fixture.png`});
    await page.locator('[data-pe="close-inspect"]').click();
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.card-opal-foil').evaluateAll(els=>els.every(el=>getComputedStyle(el).animationName==='none'))).toBe(true);
  expect(errors).toEqual([]);
  console.log('Black Opal: five tiers × three viewports, geometry, seals, readable title, selection, hidden/unowned refusal checks passed.');
} finally { await browser.close();server.kill(); }
