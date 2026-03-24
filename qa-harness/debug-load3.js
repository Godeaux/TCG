import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('requestfailed', (req) => {
  console.log(`[FAILED] ${req.url()} — ${req.failure()?.errorText}`);
});
page.on('response', (res) => {
  if (res.status() >= 400) {
    console.log(`[${res.status()}] ${res.url()}`);
  }
});
page.on('console', (msg) => {
  console.log(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  console.log(`[PAGE_ERROR] ${err.message}\n${err.stack || ''}`);
});

await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

// Check __qa
const hasQa = await page.evaluate(() => typeof window.__qa !== 'undefined');
console.log(`\nwindow.__qa available: ${hasQa}`);

await browser.close();
