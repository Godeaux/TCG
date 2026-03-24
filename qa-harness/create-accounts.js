/**
 * Create two test accounts via the game's UI.
 * Run once, then delete this file.
 */

import { chromium } from 'playwright';

const GAME_URL = 'http://localhost:8080';

const ACCOUNTS = [
  { username: 'qa-tester-1', pin: '1234' },
  { username: 'qa-tester-2', pin: '1234' },
];

async function createAccount(account) {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  console.log(`\n--- Creating account: ${account.username} ---`);

  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Screenshot to see where we are
  await page.screenshot({ path: `/tmp/qa-step1-${account.username}.png` });
  console.log('Screenshot saved: step1 (initial load)');

  // Click "Other" from main menu
  try {
    await page.waitForSelector('#menu-other', { timeout: 5000 });
    await page.click('#menu-other');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `/tmp/qa-step2-${account.username}.png` });
    console.log('Screenshot saved: step2 (other menu)');
  } catch (e) {
    console.log('Could not find #menu-other:', e.message);
    await page.screenshot({ path: `/tmp/qa-error-${account.username}.png` });
    await browser.close();
    return;
  }

  // Click "Multiplayer"
  try {
    await page.click('#other-multiplayer');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `/tmp/qa-step3-${account.username}.png` });
    console.log('Screenshot saved: step3 (multiplayer screen)');
  } catch (e) {
    console.log('Could not find #other-multiplayer:', e.message);
    await browser.close();
    return;
  }

  // Click "Log In" 
  try {
    await page.click('#multiplayer-auth');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `/tmp/qa-step4-${account.username}.png` });
    console.log('Screenshot saved: step4 (login screen)');
  } catch (e) {
    console.log('Could not find #multiplayer-auth:', e.message);
    await browser.close();
    return;
  }

  // Click "Create Account"
  try {
    await page.fill('#login-username', account.username);
    await page.fill('#login-pin', account.pin);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/qa-step5-${account.username}.png` });
    console.log('Screenshot saved: step5 (filled form)');

    await page.click('#login-create');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `/tmp/qa-step6-${account.username}.png` });
    console.log('Screenshot saved: step6 (after create)');

    // Check for error
    const errorText = await page.textContent('#login-error');
    if (errorText && errorText.trim()) {
      console.log(`Error: ${errorText}`);
    } else {
      console.log(`Account ${account.username} created successfully!`);
    }
  } catch (e) {
    console.log('Error during account creation:', e.message);
    await page.screenshot({ path: `/tmp/qa-error-create-${account.username}.png` });
  }

  await browser.close();
}

async function main() {
  for (const account of ACCOUNTS) {
    await createAccount(account);
  }
  console.log('\nDone! Check screenshots in /tmp/qa-step*.png');
}

main().catch(console.error);
