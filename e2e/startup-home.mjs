import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const server=spawn('python3',['-m','http.server','8178','--bind','127.0.0.1'],{stdio:'ignore'});
process.on('exit',()=>server.kill());
const browser=await (process.env.TCG_WEBKIT ? webkit : chromium).launch(process.env.TCG_CHROME && !process.env.TCG_WEBKIT ? {executablePath:process.env.TCG_CHROME} : {});
await mkdir('docs/startup-home',{recursive:true});
try {
 for(const [width,height] of [[430,745],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height}});
  let release;
  const held=new Promise(resolve=>release=resolve);
  await page.route('**/js/main.js*',async route=>{await held;await route.continue();});
  await page.goto('http://127.0.0.1:8178',{waitUntil:'commit'});
  try {
   await expect(page.locator('#menu-overlay')).toHaveCSS('opacity','1');
   await expect(page.locator('.game-container')).toBeHidden();
   await expect(page.locator('#menu-overlay')).toHaveAttribute('inert','');
   // Slow imports get recovery too, then hide it when initialization finishes.
   await page.waitForTimeout(400);
   if(width===430) {
    await expect(page.locator('#startup-recovery')).toBeVisible({timeout:15000});
   }
   await page.screenshot({path:`docs/startup-home/${width}-loading.png`});
  } finally {release();}
  await page.waitForFunction(()=>!document.body.hasAttribute('data-loading'));
  await expect(page.locator('#startup-recovery')).toBeHidden();
  await expect(page.locator('#menu-overlay')).toHaveClass(/active/);
  await expect(page.locator('#menu-overlay')).not.toHaveAttribute('inert','');
  // Observe the rendered surface across the transition, not just the final class.
  expect(await page.evaluate(async()=>{
   for(let i=0;i<20;i++) {
    await new Promise(requestAnimationFrame);
    const menu=document.getElementById('menu-overlay');
    if(getComputedStyle(menu).opacity!=='1') return false;
    if(!document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('#menu-overlay')) return false;
   }
   return true;
  })).toBe(true);
  await page.locator('#menu-other').click();
  await expect(page.locator('#ai-setup-overlay')).toHaveClass(/active/);
  await page.close();
  console.log(`PASS ${width}x${height}: delayed JS shows home, no board flash, controls activate after render`);
 }
 // A failed script download must not expose the board either.
 const p=await browser.newPage();
 await p.route('**/js/main.js*',route=>route.abort());
 await p.goto('http://127.0.0.1:8178');
 await expect(p.locator('#menu-overlay')).toHaveCSS('opacity','1');
 await expect(p.locator('.game-container')).toBeHidden();
 await expect(p.locator('#startup-recovery')).toBeVisible();
 await p.unroute('**/js/main.js*');
 await p.locator('#startup-retry').click();
 await p.waitForFunction(()=>!document.body.hasAttribute('data-loading'));
 await expect(p.locator('#startup-recovery')).toBeHidden();
 await expect(p.locator('#menu-overlay')).not.toHaveAttribute('inert','');
 console.log('PASS: failed startup keeps board hidden and retry restores Home');
} finally {await browser.close();server.kill();}
