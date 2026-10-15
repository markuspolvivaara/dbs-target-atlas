import { expect, test, type Page } from '@playwright/test';
import { INDICATIONS } from '../../src/data/indications';

/** Fail on any request that leaves the local server (no external runtime requests allowed). */
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
  // render the final frame synchronously so the screenshot never catches a half-animated camera
  await page.evaluate(() => {
    const v = (window as unknown as { __atlas: { viewer: { snapshot(): string } } }).__atlas.viewer;
    v.snapshot();
  });
}

/** Distinct colours in a downsampled copy of the WebGL canvas: a blank or broken render has very few. */
async function canvasColours(page: Page): Promise<number> {
  return page.evaluate(() => {
    const src = document.querySelector('.viewer-host canvas') as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    return set.size;
  });
}

for (const ind of INDICATIONS) {
  test(`indication ${ind.id}: renders and matches the visual baseline`, async ({ page }) => {
    const g = guard(page);
    await page.goto(`./#/atlas?i=${ind.id}`);
    await settle(page);
    await expect(page.locator('.card h2').first()).toHaveText(ind.name);
    expect(await canvasColours(page)).toBeGreaterThan(40);
    await expect(page.locator('.stage')).toHaveScreenshot(`atlas-${ind.id}.png`);
    expect(g.external).toEqual([]);
    expect(g.errors).toEqual([]);
  });
}

test('symptom view, slices, lead and stimulation sphere', async ({ page }) => {
  const g = guard(page);
  await page.goto('./#/atlas?i=pd&s=pd-tremor&co=-12c&ax=-6&lead=0.5,0,60,15&stim=1,2');
  await settle(page);
  await expect(page.locator('.card h2').first()).toHaveText('Tremor');
  await expect(page.locator('.card').first()).toContainText('derived stand-in');
  await page.locator('#ptab-lead').click();
  await expect(page.locator('.lead-info table tbody tr')).toHaveCount(8);
  await expect(page.locator('.warn').filter({ hasText: 'not a volume-of-tissue-activated model' })).toBeVisible();
  await expect(page.locator('.stage')).toHaveScreenshot('atlas-pd-tremor-tools.png');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('measure, hover tooltip and dragging the lead along its axis', async ({ page }) => {
  await page.goto('./#/atlas?i=pd&c=coronal&ly=n1,t0,c0,g1,e1&lead=0.5,0,60,15');
  await settle(page);
  // screen position of the right lead's contact array (patient right appears on the viewer's left in the anterior view)
  const pt = await page.evaluate(() => {
    const v = (window as any).__atlas.viewer;
    const lead = v.leads.R.group.children[2];
    const p = lead.getWorldPosition(lead.position.clone()).project(v.camera);
    const r = v.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
  // hover shows a tooltip
  await page.mouse.move(pt.x, pt.y);
  await expect(page.locator('.tip')).toBeVisible();
  // drag along the lead: depth changes and is written to the URL
  await page.mouse.down();
  await page.mouse.move(pt.x, pt.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => new URL(page.url()).hash).not.toContain('lead=0.5%2C0%2C60');
  // measurement between two picked points
  await page.keyboard.press('m');
  await page.mouse.click(pt.x - 60, pt.y + 30);
  await page.mouse.click(pt.x + 60, pt.y + 30);
  await expect(page.locator('.measure-out')).toContainText(/Distance \d/);
});

test('state survives a reload through the URL hash', async ({ page }) => {
  await page.goto('./#/atlas?i=ts&s=ts-tics&h=L&sel=cm');
  await settle(page);
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel h2')).toContainText('Centromedian');
  await expect(page.locator('[data-hemi="L"]')).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).hash).toContain('s=ts-tics');
});

test('other pages render without external requests', async ({ page }) => {
  const g = guard(page);
  await page.goto('./#/imaging?t=vim');
  await expect(page.locator('.page:not([hidden]) .card h2')).toHaveText('Ventral intermediate nucleus');
  await page.goto('./#/coords');
  await expect(page.locator('.coord h3')).toHaveText(['STN', 'GPi', 'Vim']);
  await page.fill('#acpc', '10');
  await expect(page.locator('.err')).toBeVisible();
  await page.goto('./#/refs');
  await page.fill('#ref-q', 'Horn');
  await expect(page.locator('.count')).toContainText('references');
  await page.goto('./#/credits');
  await expect(page.locator('.page:not([hidden]) h1')).toHaveText('Credits and licences');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('mobile layout: viewer above a bottom sheet @mobile', async ({ page }) => {
  const g = guard(page);
  await page.goto('./#/atlas?i=et');
  await settle(page);
  const stage = await page.locator('.stage').boundingBox();
  const panel = await page.locator('.panel').boundingBox();
  expect(stage!.height).toBeGreaterThan(250);
  expect(panel!.y).toBeGreaterThan(stage!.y + stage!.height - 40);
  await page.locator('.sheet-handle').click();
  await expect(page.locator('.panel')).toHaveAttribute('data-sheet', 'full');
  await expect(page).toHaveScreenshot('mobile-et.png');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('settings: hidden indications are remembered, links to them still work', async ({ page }) => {
  const g = guard(page);
  // default: the less common indications start hidden
  await page.goto('./#/atlas?i=pd');
  await settle(page);
  const chips = page.locator('.ind-chips .chip');
  await expect(chips).toHaveCount(6);
  for (const name of ["Parkinson's", 'Essential tremor', 'Generalized dystonia', 'Cervical dystonia', 'Focal hand dystonia', 'Epilepsy'])
    await expect(chips.filter({ hasText: name })).toHaveCount(1);
  await page.goto('./#/settings');
  await expect(page.locator('.page:not([hidden]) [aria-live="polite"]').last()).toContainText('6 of 11 indications shown');
  // change: show Tourette, hide focal hand dystonia
  await page.locator('input[data-ind="ts"]').check();
  await page.locator('input[data-ind="fhd"]').uncheck();
  // remembered across a reload
  await page.reload();
  await expect(page.locator('input[data-ind="ts"]')).toBeChecked();
  await expect(page.locator('input[data-ind="fhd"]')).not.toBeChecked();
  await page.goto('./#/atlas?i=pd');
  await settle(page);
  await expect(chips).toHaveCount(6);
  await expect(chips.filter({ hasText: 'Tourette' })).toHaveCount(1);
  await expect(chips.filter({ hasText: 'Focal hand' })).toHaveCount(0);
  // a shared link to a hidden indication still opens it, marked as hidden
  await page.goto('./#/atlas?i=holmes');
  await settle(page);
  await expect(page.locator('.card h2').first()).toHaveText('Holmes tremor');
  await expect(chips.filter({ hasText: 'Holmes tremor (hidden)' })).toHaveCount(1);
  // hiding the indication currently shown switches the atlas to the first visible one
  await page.goto('./#/atlas?i=pd');
  await settle(page);
  await page.goto('./#/settings');
  await page.locator('input[data-ind="pd"]').uncheck();
  await page.goto('./#/atlas');
  await settle(page);
  await expect(page.locator('.ind-chips .chip[aria-pressed="true"]')).not.toHaveText("Parkinson's");
  // show all, then back to the default set
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.locator('input[data-ind]:checked')).toHaveCount(11);
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.locator('input[data-ind]:checked')).toHaveCount(6);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('lead placement is remembered per target', async ({ page }) => {
  const g = guard(page);
  await page.goto('./#/atlas?i=pd&ly=n1,t0,c0,g1,e1');
  await settle(page);
  await page.locator('#ptab-lead').click();
  await page.locator('select[data-k="anchor"]').selectOption('c1');
  await page.locator('input[data-k="depth"]').fill('-1');
  await expect(page.locator('.lead-pref')).toContainText('Remembered for PD sweet spot');
  // another target gets its own (built-in) placement ...
  await page.locator('#ptab-overview').click();
  await page.locator('.ind-chips .chip', { hasText: 'Essential tremor' }).click();
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('centre');
  // ... and coming back restores PD's, also after a reload
  await page.locator('#ptab-overview').click();
  await page.locator('.ind-chips .chip', { hasText: "Parkinson's" }).click();
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('c1');
  await expect(page.locator('input[data-k="depth"]')).toHaveValue('-1');
  await page.goto('./#/atlas?i=pd&ly=n1,t0,c0,g1,e1');
  await settle(page);
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('c1');
  // a link that carries its own lead position wins over the remembered one
  await page.goto('./#/atlas?i=pd&lead=0.5,2,60,15,tip');
  await settle(page);
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('tip');
  await expect(page.locator('.lead-pref')).toContainText('From the link');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('legend: show/hide and highlight structures', async ({ page }) => {
  const g = guard(page);
  await page.goto('./#/atlas?i=et');
  await settle(page);
  await page.evaluate(() => { (document.querySelector('.legend-box') as HTMLDetailsElement).open = true; });
  const row = (text: string) => page.locator('.legend3d li', { hasText: text }).first();
  const item = (id: string) => page.evaluate((i) => {
    const it = (window as any).__atlas.viewer.items.get(i);
    const n = it.nodes.L;
    return { visible: n.visible, opacity: it.kind === 'lines' ? it.mat.opacity : n.material.opacity ?? 1, width: it.kind === 'lines' ? it.mat.linewidth : null };
  }, id);
  // hide the corticospinal tract
  await row('Corticospinal').locator('.eye').click();
  await expect(row('Corticospinal')).toHaveClass(/off/);
  expect((await item('cst')).visible).toBe(false);
  expect(new URL(page.url()).hash).toContain('hid=cst');
  // highlight the DRTT: brighter and thicker, others fade back, card opens
  const before = await item('ndrtt');
  await row('Dentato-rubro').locator('.lg-item').click();
  await expect(row('Dentato-rubro')).toHaveClass(/on/);
  const drtt = await item('drtt');
  expect(drtt.opacity).toBe(1);
  expect(drtt.width).toBeGreaterThan(2);
  expect((await item('ndrtt')).opacity).toBeLessThan(before.opacity);
  await expect(page.locator('.card.sel h2')).toContainText('Dentato-rubro-thalamic');
  // clicking again clears the highlight; "Show all" brings the hidden tract back
  await row('Dentato-rubro').locator('.lg-item').click();
  await expect(row('Dentato-rubro')).not.toHaveClass(/on/);
  await page.getByRole('button', { name: /Show all/ }).click();
  expect((await item('cst')).visible).toBe(true);
  // hidden items reset when the view changes
  await row('Corticospinal').locator('.eye').click();
  await page.locator('.ind-chips .chip', { hasText: "Parkinson's" }).click();
  expect(new URL(page.url()).hash).not.toContain('hid=');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('slices: one clear cut choice per plane', async ({ page }) => {
  const g = guard(page);
  await page.goto('./#/atlas?i=pd&co=-13');
  await settle(page);
  await page.locator('#ptab-slices').click();
  const sel = page.locator('[data-axis="coronal"] select[data-k="cut"]');
  const planes = () => page.evaluate(() => (window as any).__atlas.viewer.clipPlanes.map((p: any) => [Math.round(p.normal.z), p.constant]));
  // world z = -RAS y: removing the anterior part keeps y <= -13, i.e. z >= 13
  await sel.selectOption('pos');
  await expect.poll(planes).toEqual([[1, -13]]);
  expect(new URL(page.url()).hash).toContain('co=-13c');
  await sel.selectOption('neg');
  await expect.poll(planes).toEqual([[-1, 13]]);
  expect(new URL(page.url()).hash).toContain('co=-13cf');
  await sel.selectOption('none');
  await expect.poll(planes).toEqual([]);
  // links made with the old checkboxes still open with the same cut
  await page.goto('./#/atlas?i=pd&co=-13cf');
  await settle(page);
  await page.locator('#ptab-slices').click();
  await expect(sel).toHaveValue('neg');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});
