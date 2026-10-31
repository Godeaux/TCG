// Production gallery/inspector; ownership is an in-memory presentation fixture.
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const server = spawn('python3', ['-m', 'http.server', '8291', '--bind', '127.0.0.1'], {stdio:'ignore'});
await new Promise(r=>setTimeout(r,500));
const browser = await (process.env.TCG_BROWSER === 'webkit' ? webkit : chromium).launch();
const out = 'docs/mobile-collection';
await fs.mkdir(out,{recursive:true});
try {
  for (const [width,height] of [[390,664],[393,680],[430,746],[320,568],[1440,900]]) {
    const page = await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:width<700});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8291');
    await page.waitForFunction(() => window.__qa);
    await page.locator('#menu-decks').tap();
    await page.locator('#library-collection').tap();
    await expect(page.locator('.pe-grid .pe-tile').first()).toBeVisible();
    await page.evaluate(async()=>{
      const pe=await import('/js/ui/overlays/PlayerExperience.js');
      const {getAllCards}=await import('/js/cards/index.js');
      pe.resetPlayerExperience();
      pe.renderPlayerExperience({menu:{stage:'collection',profile:{ownedCards:new Map(getAllCards().filter(c=>!c.isToken).map((c,i)=>[c.id,['common','uncommon','rare','legendary','pristine'][i%5]]))}}});
    });
    const grid=page.locator('.pe-horizontal-gallery');
    await expect(grid.locator('.pe-tile')).not.toHaveCount(0);
    await expect(page.locator('[data-pe="prev-page"], [data-pe="next-page"]')).toHaveCount(0);
    await expect.poll(()=>grid.evaluate(g=>g.scrollHeight-g.clientHeight)).toBeLessThanOrEqual(1);
    const geometry=await grid.evaluate(g=>{
      const box=g.getBoundingClientRect();
      return {horizontal:g.scrollWidth>g.clientWidth, page:document.documentElement.scrollHeight<=innerHeight,
        cards:[...g.querySelectorAll('.card')].slice(0,10).map(c=>{
          const face=c.getBoundingClientRect(),inner=c.querySelector('.card-inner').getBoundingClientRect();
          const seal=c.querySelector('.card-rarity-seal').getBoundingClientRect();
          const glyph=c.querySelector('.card-rarity-seal svg').getBoundingClientRect();
          const edge=c.querySelector('.card-opal-edge')?.getBoundingClientRect();
          return {ratio:face.width/face.height, bottom:inner.bottom<=face.bottom-2,
            glyph:glyph.top>=seal.top && glyph.bottom<=seal.bottom,
            visible:seal.bottom<box.bottom && (!edge || edge.bottom<box.bottom)};
        })};
    });
    expect(geometry.horizontal).toBe(true);expect(geometry.page).toBe(true);
    for(const card of geometry.cards) {
      expect(card.bottom).toBe(true);expect(card.glyph).toBe(true);expect(card.visible).toBe(true);
      expect(Math.abs(card.ratio-5/7)).toBeLessThan(.006);
    }
    // Browser-native horizontal wheel movement (no page button or synthetic scroller).
    if (process.env.TCG_BROWSER === 'webkit' && width < 700) {
      // Playwright WebKit cannot synthesize mobile wheel/swipe input.
      await grid.evaluate(g=>g.scrollBy(300,0));
    } else if (width < 700) {
      const cdp=await page.context().newCDPSession(page);
      const box=await grid.boundingBox();
      const y=box.y+box.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width-35,y}]});
      for(let x=width-55;x>=35;x-=20) {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await cdp.detach();
    } else {
      await grid.hover();await page.mouse.wheel(300,0);
    }
    await expect.poll(()=>grid.evaluate(g=>g.scrollLeft)).toBeGreaterThan(50);
    expect(await grid.evaluate(g=>g.scrollTop)).toBe(0);
    await grid.evaluate(g=>g.scrollTo(g.scrollWidth,0));
    await expect(grid.locator('.pe-tile').last()).toBeInViewport();
    // Filtering resets the native offset; empty results stay usable.
    await page.locator('#pe-search').fill('no such creature');
    await expect(grid.locator('.pe-empty')).toBeVisible();
    await page.locator('#pe-search').fill('Black Leopards');
    await grid.locator('.pe-tile').tap();
    const tip=page.locator('#card-hover-tooltip');
    await expect(tip.getByRole('button',{name:/Previous|Next/})).toHaveCount(0);
    await tip.locator('.tooltip-token-link').tap();
    await expect(tip).toHaveAttribute('aria-label','Inspect Black Leopard');
    await tip.getByRole('button',{name:'← Back',exact:true}).tap();
    await expect(tip).toHaveAttribute('aria-label','Inspect Black Leopards');
    // Blank dialog padding dismisses just like the outer backdrop.
    const rect=await tip.boundingBox();
    await page.touchscreen.tap(rect.x+2,rect.y+2);
    await expect(tip).not.toHaveClass(/visible/);
    await grid.locator('.pe-tile').tap();await page.touchscreen.tap(2,2);
    await expect(tip).not.toHaveClass(/visible/);
    await page.mouse.move(1,1);
    await page.locator('#pe-search').fill('');
    await expect(tip).not.toHaveClass(/visible/);
    await page.screenshot({path:`${out}/${process.env.TCG_BROWSER||'chromium'}-${width}x${height}.png`});
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log('PASS horizontal collection: five viewport sizes, no vertical overflow, full seals/borders, native scrolling, filter reset, background dismiss, token back.');
} finally {await browser.close();server.kill();}
