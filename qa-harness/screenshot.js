import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

await page.screenshot({ path: '/Users/nut/.openclaw/workspace/agents/brains/game-fresh-load.png', fullPage: true });
console.log('Screenshot saved');

await browser.close();
