import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('response', (res) => {
  if (res.status() >= 400) {
    console.log(`[${res.status()}] ${res.url()}`);
  }
});
page.on('pageerror', (err) => {
  // Stack trace should show which file
  console.log(`[PAGE_ERROR] ${err.message}`);
  if (err.stack) console.log(err.stack);
});

await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await browser.close();
