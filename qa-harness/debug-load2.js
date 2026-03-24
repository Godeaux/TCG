import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Capture failed requests
page.on('requestfailed', (req) => {
  console.log(`[FAILED] ${req.url()} — ${req.failure()?.errorText}`);
});

page.on('response', (res) => {
  if (res.status() >= 400) {
    console.log(`[${res.status()}] ${res.url()}`);
  }
});

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    console.log(`[console.error] ${msg.text()}`);
  }
});

page.on('pageerror', (err) => {
  console.log(`[PAGE_ERROR] ${err.message}`);
});

await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

await browser.close();
