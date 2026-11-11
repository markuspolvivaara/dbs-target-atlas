import { expect, test, type Page } from '@playwright/test';

/**
 * Regression tests for the fixes that followed the audit of November 2026 (audit/README.md on the audit branch). Each
 * test names the finding it guards. No picture comparisons here: they run the same on every platform.
 */

/** Fail on any request that leaves the local server, and on any page or console error. */
function guard(page: Page) {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'blob:') external.push(r.url()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { external, errors };
}

async function settle(page: Page) {
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const a = (window as unknown as { __atlas: { viewer: { isIdle(): boolean } } }).__atlas;
    return a.viewer.isIdle();
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
}

// E-001: the level card used the lumbar rule at cervical discs (a foraminal herniation at C5-C6 was said to affect C5)
test('spine: at a cervical disc the level card names the root that leaves there, and the link survives a reload', async ({ page }) => {
  const g = guard(page);
  await page.goto('./spine/#/atlas?r=cervical&lv=C5');
  await settle(page);
  const card = page.locator('.card.sel');
  // no far lateral zone in the neck (the vertebral artery runs there), as in the drilling tool
  await expect(card.locator('.lesion-kind .chip')).toHaveText(['None', 'Paracentral', 'Foraminal']);
  await card.locator('.lesion-kind .chip[data-v="foraminal"]').click();
  await expect(card.locator('.lesion-result')).toContainText('C6 nerve root (the root that leaves at this disc), left');
  await card.locator('.lesion-kind .chip[data-v="paracentral"]').click();
  await card.locator('.lesion-side .chip[data-v="R"]').click();
  await expect(card.locator('.lesion-result')).toContainText('C6 nerve root (the root that leaves at this disc), right');
  // the card's own "Root at C5-C6" line names the same root
  await expect(card).toContainText('Exiting: C6 nerve root');
  await expect.poll(() => new URL(page.url()).hash).toContain('les=C5-C6.paracentral.R');
  await settle(page);
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel .lesion-result')).toContainText('C6 nerve root (the root that leaves at this disc), right');
  // C8 leaves between C7 and T1
  await page.goto('./spine/#/atlas?r=cervical&lv=C7&les=C7-T1.foraminal.L');
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel .lesion-result')).toContainText('C8 nerve root (the root that leaves at this disc), left');
  // the lumbar rule is unchanged
  await page.goto('./spine/#/atlas?r=lumbar&lv=L4&les=L4-L5.foraminal.L');
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel .lesion-result')).toContainText('L4 nerve root (exiting), left');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});
