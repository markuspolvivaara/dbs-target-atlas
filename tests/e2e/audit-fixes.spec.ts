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

/** Open a view afresh and wait for it (a change of the hash alone would not load the page again). */
async function open(page: Page, url: string) {
  await page.goto('about:blank');
  await page.goto(url);
  await settle(page);
}

// E-001: the level card used the lumbar rule at cervical discs (a foraminal herniation at C5-C6 was said to affect C5)
test('spine: at a cervical disc the level card names the root that leaves there, and the link survives a reload', async ({ page }) => {
  const g = guard(page);
  await open(page, './spine/#/atlas?r=cervical&lv=C5');
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
  await open(page, './spine/#/atlas?r=cervical&lv=C7&les=C7-T1.foraminal.L');
  await expect(page.locator('.card.sel .lesion-result')).toContainText('C8 nerve root (the root that leaves at this disc), left');
  // the lumbar rule is unchanged
  await open(page, './spine/#/atlas?r=lumbar&lv=L4&les=L4-L5.foraminal.L');
  await expect(page.locator('.card.sel .lesion-result')).toContainText('L4 nerve root (exiting), left');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

/** Which sides of a structure's mesh are drawn now (the viewer's own nodes, by their names L and R). */
async function drawnSides(page: Page, id: string): Promise<Record<string, boolean> | null> {
  return page.evaluate((sid) => {
    const v = (window as unknown as { __atlas: { viewer: { items: Map<string, { nodes: Record<string, { visible: boolean } | undefined> }> } } }).__atlas.viewer;
    const it = v.items.get(sid);
    return it ? Object.fromEntries(Object.entries(it.nodes).filter(([, n]) => n).map(([k, n]) => [k, n!.visible])) : null;
  }, id);
}

// MB-01: the left-sided lesions were stored in a node named R, so "Left" hid them and "Right" drew them beside the brain
test('vascular: a lesion on the left is drawn with Left and hidden with Right', async ({ page }) => {
  const g = guard(page);
  for (const [grp, part] of [['avm3', 'va_avm3__nidus'], ['avm3', 'va_avm3__feeders'], ['avm3', 'va_avm3__drainers']] as const) {
    await open(page, `./vascular/#/atlas?g=${grp}&h=L`);
    expect(await drawnSides(page, part), `${part} with Left`).toEqual({ L: true });
    await page.locator('[data-hemi="R"]').click();
    await settle(page);
    expect(await drawnSides(page, part), `${part} with Right`).toEqual({ L: false });
  }
  // a lesion on the right, the other way round
  await open(page, './vascular/#/atlas?g=avm1&h=R');
  expect(await drawnSides(page, 'va_avm1__nidus')).toEqual({ R: true });
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// D-001: the AVM outcome columns hold Hafez 2019's "unchanged or improved" counts, not Modified Rankin Scale 0-2
test('vascular: the grading tables name the outcome their numbers are', async ({ page }) => {
  const g = guard(page);
  await page.goto('./vascular/#/grading');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  const text = await page.locator('main').innerText();
  expect(text).toContain('Modified Rankin Scale score unchanged or improved after surgery');
  expect(text).toContain('85 % (40 of 47)');
  expect(text).not.toMatch(/Rankin Scale 0.2/);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});
