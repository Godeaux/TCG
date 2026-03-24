import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('response', (res) => {
  if (res.status() >= 400) console.log(`[${res.status()}] ${res.url()}`);
});

await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Check menu visibility
const menuHidden = await page.getAttribute('#menu-overlay', 'aria-hidden');
console.log(`menu-overlay aria-hidden: ${menuHidden}`);

// Try getting state
const state = await page.evaluate(() => {
  try { return window.__qa.getState(); } catch(e) { return { error: e.message }; }
});
console.log(`Game state: phase=${state.phase}, turn=${state.turn}`);

await browser.close();
