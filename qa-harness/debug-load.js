import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Capture all console messages and errors
const logs = [];
page.on('console', (msg) => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  logs.push(`[PAGE_ERROR] ${err.message}`);
});

await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// Print all logs
console.log('\n=== BROWSER CONSOLE OUTPUT ===');
for (const log of logs) {
  console.log(log);
}

// Check if menu overlay is visible
const menuHidden = await page.getAttribute('#menu-overlay', 'aria-hidden');
console.log(`\nmenu-overlay aria-hidden: ${menuHidden}`);
const menuDisplay = await page.evaluate(() => {
  const el = document.getElementById('menu-overlay');
  if (!el) return 'NOT FOUND';
  const style = window.getComputedStyle(el);
  return `display:${style.display} visibility:${style.visibility} opacity:${style.opacity} z-index:${style.zIndex}`;
});
console.log(`menu-overlay computed style: ${menuDisplay}`);

await browser.close();
