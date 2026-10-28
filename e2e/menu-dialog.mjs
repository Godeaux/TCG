import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn('python3', ['-m', 'http.server', '8164', '--bind', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 500));
const browser =
  process.env.TCG_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({
        ...(process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}),
      });
try {
  const p = await browser.newPage();
  await p.goto('http://127.0.0.1:8164');
  const open = async (options) =>
    p.evaluate(async (options) => {
      const { showMenuDialog } = await import('/js/ui/components/MenuDialog.js');
      window.dialogResult = 'pending';
      showMenuDialog(options).then((result) => {
        window.dialogResult = result;
      });
    }, options);
  const result = async (expected) => {
    await expect(p.locator('.menu-dialog')).toHaveCount(0);
    assert.equal(await p.evaluate(() => window.dialogResult), expected);
  };
  for (const [width, height] of [
    [1440, 900],
    [393, 852],
    [375, 600],
  ]) {
    await p.setViewportSize({ width, height });
    await p.locator('#menu-decks').focus();
    await open({ title: 'Rename deck', value: 'Fish', confirmLabel: 'Save' });
    await expect(p.locator('.menu-dialog input')).toBeFocused();
    await p.locator('.menu-dialog input').fill('   ');
    await expect(p.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await p.locator('.menu-dialog input').fill(' Fish revised ');
    await p.keyboard.press('Enter');
    await result('Fish revised');
    await expect(p.locator('#menu-decks')).toBeFocused();
    await open({ title: 'Rename deck', value: 'Fish', confirmLabel: 'Save' });
    await p.keyboard.press('Escape');
    await result(null);
    await open({
      title: 'Delete deck?',
      message: '“Fish” will be deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    await expect(p.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await p.keyboard.press('Enter');
    await result(null);
    await open({
      title: 'Delete deck?',
      message: '“' + '<script>Long name</script>'.repeat(15) + '” will be deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    assert.equal(await p.locator('.menu-dialog script').count(), 0);
    const fits = await p.locator('.menu-dialog').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        el.scrollWidth <= el.clientWidth
      );
    });
    assert.equal(fits, true);
    await p.getByRole('button', { name: 'Delete', exact: true }).click();
    await result(true);
  }
  console.log(
    'PASS menu dialogs: rename, whitespace refusal, Escape, safe default, explicit delete, focus restoration, literal names, 3 viewport bounds'
  );
} finally {
  await browser.close();
  server.kill();
}
