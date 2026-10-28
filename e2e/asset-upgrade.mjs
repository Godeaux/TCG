// A returning browser must replace cached styles AND transitive JS modules.
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const legacyHtml = html.replace(/\s*<!-- release-assets:start -->[\s\S]*?<!-- release-assets:end -->/, '')
  .replace(/(href|src)="([^"?]+\.(?:css|js))\?[^\"]*"/g, '$1="$2"');
let upgraded = false;
const requests = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    requests.push(url.pathname + url.search);
    let content = await readFile(path.join(root, name));
    if (name === 'index.html') content = upgraded ? html : legacyHtml;
    // Stale fixture markers distinguish the browser cache from a fresh response.
    if (!upgraded && name === 'finish-polish.css') content += '\n#menu-overlay .home-play-row { display: block !important; }';
    if (!upgraded && name === 'js/main.js') content += '\nglobalThis.__cachedReleaseProbe = "previous";';
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    res.writeHead(200, {'Content-Type':type, 'Cache-Control': name === 'index.html' ? 'no-store' : 'public, max-age=86400'});
    res.end(content);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const engine = process.env.TCG_WEBKIT ? webkit : chromium;
const browser = await engine.launch(process.env.TCG_CHROME && !process.env.TCG_WEBKIT ? {executablePath:process.env.TCG_CHROME} : {});
try {
  const page = await browser.newPage({viewport:{width:430,height:745}});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(()=>globalThis.__cachedReleaseProbe === 'previous');
  await expect(page.locator('.home-play-row')).toHaveCSS('display','block');
  // Warm the HTTP cache, then publish a new document without clearing it.
  upgraded=true;
  requests.length=0;
  await page.goto(base);
  await expect(page.locator('.home-play-row')).toHaveCSS('display','grid');
  await expect(page.locator('#settings-button-container #menu-profile')).toBeVisible();
  expect(await page.evaluate(()=>globalThis.__cachedReleaseProbe)).toBeUndefined();
  for (const file of ['finish-polish.css','js/main.js','js/ui/components/SettingsButton.js','js/ui/overlays/MenuOverlay.js','js/ui/input/inputRouter.js']) {
    expect(requests.some(url=>url.startsWith(`/${file}?v=`)), `${file} must refresh, including transitive imports`).toBe(true);
  }
  const online=await page.locator('#menu-find-match').boundingBox();
  const friends=await page.locator('#other-multiplayer').boundingBox();
  expect(Math.abs(online.y-friends.y)).toBeLessThan(1);
  const tip=await page.locator('#menu-splash-text').boundingBox();
  const help=await page.locator('#other-tutorial').boundingBox();
  expect(help.y).toBeGreaterThanOrEqual(tip.y+tip.height);
  expect(help.height).toBeGreaterThanOrEqual(44);
  await mkdir(path.join(root,'docs/asset-upgrade'),{recursive:true});
  await page.screenshot({path:path.join(root,`docs/asset-upgrade/${process.env.TCG_WEBKIT ? 'webkit' : 'chromium'}-returning-phone.png`)});
  await page.locator('#other-multiplayer').click();
  await expect(page.locator('#lobby-create')).toBeVisible();
  await expect(page.locator('#lobby-code')).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: warm-cache upgrade refreshes CSS, entry module and transitive modules; phone layout and friends flow hold.');
} finally {await browser.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
